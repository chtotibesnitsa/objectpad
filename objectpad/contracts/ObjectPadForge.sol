// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IERC20Like { function balanceOf(address) external view returns (uint256); function transfer(address,uint256) external returns (bool); function transferFrom(address,address,uint256) external returns (bool); }
interface IRegistryLinks { function objectOfToken(address) external view returns (bytes32); }
interface IERC721Receiver { function onERC721Received(address,address,uint256,bytes calldata) external returns (bytes4); }

/// @notice The Crafting Table. Lock 2-3 ObjectPad object coins into one transferable Artifact (ERC-721).
/// Each Artifact earns the Forge share of creator fees from every coin it contains, pro rata to its weighted shares.
/// Weighted shares = locked amount x multiplier. Multiplier comes only from recipe size, lock length and an optional
/// $OBJECTPAD burn. After the lock ends the holder may dissolve the Artifact and recover every locked coin.
/// Burned $OBJECTPAD is sent to the dead address and never returned. UNAUDITED.
contract ObjectPadForge {
    string public constant name = "ObjectPad Artifacts";
    string public constant symbol = "ARTIFACT";
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MIN_INGREDIENT = 1_000_000e18;
    uint256 private constant ACC = 1e36;
    address public immutable registry;
    address public immutable objectpadToken;
    string private baseUri;

    struct Item { uint64 craftedAt; uint64 unlockAt; uint16 multiplierBps; uint8 count; uint256 burned; }
    mapping(uint256 => Item) public items;
    mapping(uint256 => address[]) private itemTokens;
    mapping(uint256 => uint256[]) private itemAmounts;
    mapping(uint256 => uint256[]) private itemShares;
    mapping(uint256 => mapping(address => uint256)) private rewardDebt;
    mapping(address => uint256) public totalShares;
    mapping(address => uint256) public totalLocked;
    mapping(address => uint256) public accRewardPerShare;
    uint256 public nextItemId = 1;

    mapping(uint256 => address) private owners;
    mapping(address => uint256[]) private owned;
    mapping(uint256 => uint256) private ownedIndex;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    uint256 private locked = 1;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Crafted(uint256 indexed itemId, address indexed owner, address[] tokens, uint256[] amounts, uint16 multiplierBps, uint64 unlockAt, uint256 burned);
    event RewardNotified(address indexed token, uint256 amount);
    event Claimed(uint256 indexed itemId, address indexed owner, uint256 amount);
    event Dissolved(uint256 indexed itemId, address indexed owner);
    error InvalidRecipe(); error NotObjectCoin(); error Locked(); error Unauthorized(); error NoShares(); error TransferFailed(); error Reentrant(); error UnknownItem(); error UnsafeRecipient(); error BurnUnavailable();

    constructor(address registry_, address objectpadToken_, string memory baseUri_) { if (registry_ == address(0)) revert InvalidRecipe(); registry = registry_; objectpadToken = objectpadToken_; baseUri = baseUri_; }
    modifier nonReentrant() { if (locked != 1) revert Reentrant(); locked = 2; _; locked = 1; }

    function lockDays(uint8 tier) public pure returns (uint64) { if (tier == 0) return 30; if (tier == 1) return 90; if (tier == 2) return 180; revert InvalidRecipe(); }
    function lockBonus(uint8 tier) public pure returns (uint256) { if (tier == 0) return 0; if (tier == 1) return 5_000; if (tier == 2) return 10_000; revert InvalidRecipe(); }
    function burnAmount(uint8 tier) public pure returns (uint256) { if (tier == 0) return 0; if (tier == 1) return 100_000e18; if (tier == 2) return 1_000_000e18; revert InvalidRecipe(); }
    function burnBonus(uint8 tier) public pure returns (uint256) { if (tier == 0) return 0; if (tier == 1) return 2_500; if (tier == 2) return 5_000; revert InvalidRecipe(); }
    function multiplierOf(uint256 count, uint8 lockTier, uint8 burnTier) public pure returns (uint16) { if (count < 2 || count > 3) revert InvalidRecipe(); return uint16(10_000 + (count == 3 ? 2_500 : 0) + lockBonus(lockTier) + burnBonus(burnTier)); }

    function craft(address[] calldata tokens, uint256[] calldata amounts, uint8 lockTier, uint8 burnTier) external nonReentrant returns (uint256 itemId) {
        uint256 count = tokens.length;
        if (count < 2 || count > 3 || amounts.length != count) revert InvalidRecipe();
        for (uint256 i; i < count; i++) {
            if (amounts[i] < MIN_INGREDIENT) revert InvalidRecipe();
            if (IRegistryLinks(registry).objectOfToken(tokens[i]) == bytes32(0)) revert NotObjectCoin();
            for (uint256 j; j < i; j++) if (tokens[j] == tokens[i]) revert InvalidRecipe();
        }
        uint16 multiplier = multiplierOf(count, lockTier, burnTier);
        uint256 burned = burnAmount(burnTier);
        if (burned > 0) { if (objectpadToken == address(0)) revert BurnUnavailable(); _pull(objectpadToken, msg.sender, DEAD, burned); }
        itemId = nextItemId++;
        uint64 unlockAt = uint64(block.timestamp) + lockDays(lockTier) * 1 days;
        items[itemId] = Item(uint64(block.timestamp), unlockAt, multiplier, uint8(count), burned);
        for (uint256 i; i < count; i++) {
            address token = tokens[i];
            _pull(token, msg.sender, address(this), amounts[i]);
            uint256 shares = amounts[i] * multiplier / 10_000;
            itemTokens[itemId].push(token); itemAmounts[itemId].push(amounts[i]); itemShares[itemId].push(shares);
            totalShares[token] += shares; totalLocked[token] += amounts[i];
            rewardDebt[itemId][token] = shares * accRewardPerShare[token] / ACC;
        }
        _mint(msg.sender, itemId);
        emit Crafted(itemId, msg.sender, tokens, amounts, multiplier, unlockAt, burned);
    }

    /// @notice Called by object fee vaults with the Forge share of harvested creator fees for `token`.
    function notifyReward(address token) external payable {
        uint256 shares = totalShares[token];
        if (shares == 0) revert NoShares();
        accRewardPerShare[token] += msg.value * ACC / shares;
        emit RewardNotified(token, msg.value);
    }
    function pending(uint256 itemId) public view returns (uint256 amount) {
        address[] storage tokens = itemTokens[itemId];
        for (uint256 i; i < tokens.length; i++) amount += itemShares[itemId][i] * accRewardPerShare[tokens[i]] / ACC - rewardDebt[itemId][tokens[i]];
    }
    function claim(uint256 itemId) external nonReentrant returns (uint256 paid) { if (ownerOf(itemId) != msg.sender) revert Unauthorized(); paid = _settle(itemId, msg.sender); }
    function dissolve(uint256 itemId) external nonReentrant {
        if (ownerOf(itemId) != msg.sender) revert Unauthorized();
        if (block.timestamp < items[itemId].unlockAt) revert Locked();
        _settle(itemId, msg.sender);
        address[] memory tokens = itemTokens[itemId]; uint256[] memory amounts = itemAmounts[itemId]; uint256[] memory shares = itemShares[itemId];
        for (uint256 i; i < tokens.length; i++) { totalShares[tokens[i]] -= shares[i]; totalLocked[tokens[i]] -= amounts[i]; delete rewardDebt[itemId][tokens[i]]; }
        delete itemTokens[itemId]; delete itemAmounts[itemId]; delete itemShares[itemId]; delete items[itemId];
        _burn(msg.sender, itemId);
        for (uint256 i; i < tokens.length; i++) if (!IERC20Like(tokens[i]).transfer(msg.sender, amounts[i])) revert TransferFailed();
        emit Dissolved(itemId, msg.sender);
    }
    function _settle(uint256 itemId, address to) private returns (uint256 paid) {
        address[] storage tokens = itemTokens[itemId];
        for (uint256 i; i < tokens.length; i++) { uint256 accrued = itemShares[itemId][i] * accRewardPerShare[tokens[i]] / ACC; paid += accrued - rewardDebt[itemId][tokens[i]]; rewardDebt[itemId][tokens[i]] = accrued; }
        if (paid > 0) { (bool ok,) = to.call{value: paid}(""); if (!ok) revert TransferFailed(); emit Claimed(itemId, to, paid); }
    }
    function _pull(address token, address from, address to, uint256 amount) private {
        uint256 before = IERC20Like(token).balanceOf(to);
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Like.transferFrom.selector, from, to, amount));
        if (!ok || (data.length > 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        if (IERC20Like(token).balanceOf(to) - before != amount) revert TransferFailed();
    }
    function ingredientsOf(uint256 itemId) external view returns (address[] memory tokens, uint256[] memory amounts, uint256[] memory shares) { return (itemTokens[itemId], itemAmounts[itemId], itemShares[itemId]); }
    function itemsOf(address owner) external view returns (uint256[] memory) { return owned[owner]; }

    // Minimal ERC-721. Accrued rewards stay with the Artifact when it changes hands.
    function supportsInterface(bytes4 id) external pure returns (bool) { return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f; }
    function balanceOf(address owner) external view returns (uint256) { return owned[owner].length; }
    function ownerOf(uint256 id) public view returns (address owner) { owner = owners[id]; if (owner == address(0)) revert UnknownItem(); }
    function tokenURI(uint256 id) external view returns (string memory) { ownerOf(id); return string(abi.encodePacked(baseUri, _toString(id))); }
    function approve(address to, uint256 id) external { address owner = ownerOf(id); if (msg.sender != owner && !isApprovedForAll[owner][msg.sender]) revert Unauthorized(); getApproved[id] = to; emit Approval(owner, to, id); }
    function setApprovalForAll(address operator, bool approved) external { isApprovedForAll[msg.sender][operator] = approved; emit ApprovalForAll(msg.sender, operator, approved); }
    function transferFrom(address from, address to, uint256 id) public nonReentrant {
        address owner = ownerOf(id);
        if (owner != from || to == address(0)) revert Unauthorized();
        if (msg.sender != owner && getApproved[id] != msg.sender && !isApprovedForAll[owner][msg.sender]) revert Unauthorized();
        delete getApproved[id]; _removeOwned(from, id); _addOwned(to, id); owners[id] = to;
        emit Transfer(from, to, id);
    }
    function safeTransferFrom(address from, address to, uint256 id) external { safeTransferFrom(from, to, id, ""); }
    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public {
        transferFrom(from, to, id);
        if (to.code.length > 0 && IERC721Receiver(to).onERC721Received(msg.sender, from, id, data) != IERC721Receiver.onERC721Received.selector) revert UnsafeRecipient();
    }
    function _mint(address to, uint256 id) private { owners[id] = to; _addOwned(to, id); emit Transfer(address(0), to, id); }
    function _burn(address from, uint256 id) private { delete getApproved[id]; _removeOwned(from, id); delete owners[id]; emit Transfer(from, address(0), id); }
    function _addOwned(address to, uint256 id) private { ownedIndex[id] = owned[to].length; owned[to].push(id); }
    function _removeOwned(address from, uint256 id) private { uint256 index = ownedIndex[id]; uint256 last = owned[from][owned[from].length - 1]; owned[from][index] = last; ownedIndex[last] = index; owned[from].pop(); delete ownedIndex[id]; }
    function _toString(uint256 value) private pure returns (string memory) { if (value == 0) return "0"; uint256 digits; for (uint256 v = value; v != 0; v /= 10) digits++; bytes memory out = new bytes(digits); while (value != 0) { digits--; out[digits] = bytes1(uint8(48 + value % 10)); value /= 10; } return string(out); }
}

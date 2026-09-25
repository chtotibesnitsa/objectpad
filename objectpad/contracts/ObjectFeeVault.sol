// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IRegistryRecords { function exists(bytes32) external view returns (bool); function creatorOf(bytes32) external view returns (address); function tokenOf(bytes32) external view returns (address); }
interface IPonsEscrow { function balanceOf(address) external view returns (uint256); function claim() external; }
interface IForgeRewards { function totalShares(address token) external view returns (uint256); function notifyReward(address token) external payable; }

/// @notice One vault per object. Its predictable CREATE2 address is set as the Pons creator-fee recipient at launch.
/// Harvesting pulls accrued creator tax from the Pons escrow and splits it in equal thirds (0.5% of every trade each):
/// creator, Forge holders of this object's coin (weighted by lock time), and $OBJECTPAD buy-and-burn. If no crafted item holds the coin, the Forge share goes to the burn. UNAUDITED.
contract ObjectFeeVault {
    uint256 public constant CREATOR_BPS = 3_334;
    uint256 public constant FORGE_BPS = 3_333;
    ObjectFeeVaultFactory public immutable factory;
    bytes32 public immutable objectId;
    uint256 public creatorOwed;
    uint256 public totalHarvested;
    uint256 private locked = 1;
    event Harvested(uint256 total, uint256 creatorCut, uint256 forgeCut, uint256 burnCut);
    event OwedWithdrawn(address indexed creator, uint256 amount);
    error Reentrant(); error Unauthorized(); error TransferFailed();

    constructor(bytes32 objectId_) { factory = ObjectFeeVaultFactory(msg.sender); objectId = objectId_; }
    receive() external payable {}
    modifier nonReentrant() { if (locked != 1) revert Reentrant(); locked = 2; _; locked = 1; }

    function harvest() external nonReentrant returns (uint256 total) {
        IPonsEscrow escrow = IPonsEscrow(factory.escrow());
        if (escrow.balanceOf(address(this)) > 0) escrow.claim();
        total = address(this).balance - creatorOwed;
        if (total == 0) return 0;
        uint256 creatorCut = total * CREATOR_BPS / 10_000;
        uint256 forgeCut = total * FORGE_BPS / 10_000;
        uint256 burnCut = total - creatorCut - forgeCut;
        IRegistryRecords registry = IRegistryRecords(factory.registry());
        address token = registry.tokenOf(objectId);
        IForgeRewards forge = IForgeRewards(factory.forge());
        if (token != address(0) && forge.totalShares(token) > 0) forge.notifyReward{value: forgeCut}(token);
        else { burnCut += forgeCut; forgeCut = 0; }
        (bool burnOk,) = factory.burnEngine().call{value: burnCut}("");
        if (!burnOk) revert TransferFailed();
        address creator = registry.creatorOf(objectId);
        (bool paid,) = creator.call{value: creatorCut, gas: 40_000}("");
        if (!paid) creatorOwed += creatorCut;
        totalHarvested += total;
        emit Harvested(total, creatorCut, forgeCut, burnCut);
    }
    /// @notice Pull path for a creator wallet that could not accept a push payment.
    function withdrawOwed() external nonReentrant {
        address creator = IRegistryRecords(factory.registry()).creatorOf(objectId);
        if (msg.sender != creator) revert Unauthorized();
        uint256 amount = creatorOwed; creatorOwed = 0;
        (bool ok,) = creator.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit OwedWithdrawn(creator, amount);
    }
}

/// @notice Deterministic vault deployer. Vaults are permissionless to deploy and harvest; parameters are immutable.
contract ObjectFeeVaultFactory {
    address public immutable registry;
    address public immutable escrow;
    address public immutable forge;
    address public immutable burnEngine;
    mapping(bytes32 => address) public deployed;
    event VaultDeployed(bytes32 indexed objectId, address vault);
    error UnknownObject(); error InvalidConfig();

    constructor(address registry_, address escrow_, address forge_, address burnEngine_) {
        if (registry_ == address(0) || escrow_ == address(0) || forge_ == address(0) || burnEngine_ == address(0)) revert InvalidConfig();
        registry = registry_; escrow = escrow_; forge = forge_; burnEngine = burnEngine_;
    }
    /// @notice The address to use as the Pons creator-fee recipient before the vault exists.
    function vaultOf(bytes32 objectId) public view returns (address) {
        bytes32 initHash = keccak256(abi.encodePacked(type(ObjectFeeVault).creationCode, abi.encode(objectId)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), objectId, initHash)))));
    }
    function deploy(bytes32 objectId) public returns (address vault) {
        vault = deployed[objectId];
        if (vault != address(0)) return vault;
        if (!IRegistryRecords(registry).exists(objectId)) revert UnknownObject();
        vault = address(new ObjectFeeVault{salt: objectId}(objectId));
        deployed[objectId] = vault;
        emit VaultDeployed(objectId, vault);
    }
    function harvest(bytes32 objectId) external returns (uint256) { return ObjectFeeVault(payable(deploy(objectId))).harvest(); }
}

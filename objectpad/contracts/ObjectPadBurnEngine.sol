// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IPonsCurve {
    function token() external view returns (address);
    function graduated() external view returns (bool);
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256);
}
interface IERC20Balance { function balanceOf(address) external view returns (uint256); function curve() external view returns (address); }

/// @notice $OBJECTPAD buy-and-burn. Accepts ETH from object fee vaults and buys $OBJECTPAD on its Pons curve with the
/// dead address as the recipient, so bought supply never touches ObjectPad custody. UNAUDITED.
/// @dev Only the keeper may execute, with a keeper-supplied minimum output, to prevent self-sandwiching with a zero floor.
/// Nobody can withdraw ETH: it can only leave as a curve buy delivered to the dead address.
contract ObjectPadBurnEngine {
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address public immutable token;
    address public immutable curve;
    address public immutable guardian;
    uint256 public immutable maxPerBurn;
    address public keeper;
    uint256 public totalEthSpent;
    uint256 public totalBurned;
    uint256 public burns;
    uint256 private locked = 1;
    event Funded(address indexed from, uint256 amount);
    event Burned(uint256 ethIn, uint256 tokensBurned, uint256 timestamp);
    event KeeperChanged(address keeper);
    error Unauthorized(); error InvalidAmount(); error Graduated(); error Slippage(); error InvalidConfig(); error Reentrant();

    constructor(address token_, address curve_, address keeper_, address guardian_, uint256 maxPerBurn_) {
        if (token_ == address(0) || curve_ == address(0) || keeper_ == address(0) || guardian_ == address(0) || maxPerBurn_ == 0) revert InvalidConfig();
        if (IPonsCurve(curve_).token() != token_ || IERC20Balance(token_).curve() != curve_) revert InvalidConfig();
        token = token_; curve = curve_; keeper = keeper_; guardian = guardian_; maxPerBurn = maxPerBurn_;
    }
    receive() external payable { emit Funded(msg.sender, msg.value); }
    function setKeeper(address next) external { if (msg.sender != guardian) revert Unauthorized(); if (next == address(0)) revert InvalidConfig(); keeper = next; emit KeeperChanged(next); }
    function execute(uint256 amount, uint256 minTokensOut) external returns (uint256 burned) {
        if (locked != 1) revert Reentrant();
        locked = 2;
        if (msg.sender != keeper) revert Unauthorized();
        if (amount == 0 || amount > maxPerBurn || amount > address(this).balance || minTokensOut == 0) revert InvalidAmount();
        if (IPonsCurve(curve).graduated()) revert Graduated();
        uint256 before = IERC20Balance(token).balanceOf(DEAD);
        IPonsCurve(curve).buy{value: amount}(amount, minTokensOut, DEAD);
        burned = IERC20Balance(token).balanceOf(DEAD) - before;
        if (burned < minTokensOut) revert Slippage();
        totalEthSpent += amount; totalBurned += burned; burns += 1;
        emit Burned(amount, burned, block.timestamp);
        locked = 1;
    }
}

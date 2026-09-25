// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface Vm {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes4) external;
    function warp(uint256) external;
    function deal(address, uint256) external;
}

/// @dev Controlled test token shaped like a Pons launch token. Not a production asset.
contract MockToken {
    string public name; string public symbol = "TEST"; uint8 public constant decimals = 18;
    address public curve; uint256 public totalSupply;
    mapping(address => uint256) public balanceOf; mapping(address => mapping(address => uint256)) public allowance;
    constructor(string memory name_, address curve_) { name = name_; curve = curve_; }
    function setCurve(address curve_) external { curve = curve_; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; totalSupply += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external virtual returns (bool) { allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true; }
}

/// @dev Fee-on-transfer token used to prove the Forge rejects short deliveries.
contract TaxToken is MockToken {
    constructor(string memory name_, address curve_) MockToken(name_, curve_) {}
    function transferFrom(address from, address to, uint256 amount) external override returns (bool) { allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount - amount / 100; return true; }
}

/// @dev Constant-rate curve: 1 wei buys `rate` token units, minted to the recipient.
contract MockCurve {
    address public token; bool public graduated; uint256 public rate = 1000;
    function setToken(address token_) external { token = token_; }
    function setGraduated(bool value) external { graduated = value; }
    function setRate(uint256 value) external { rate = value; }
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256 out) {
        require(msg.value == quoteIn, "value"); out = quoteIn * rate; require(out >= minTokensOut, "slippage");
        MockToken(token).mint(recipient, out);
    }
}

/// @dev Escrow holding creator-tax balances per recipient; claim() pays msg.sender.
contract MockEscrow {
    mapping(address => uint256) public balanceOf;
    function accrue(address recipient) external payable { balanceOf[recipient] += msg.value; }
    function claim() external { uint256 amount = balanceOf[msg.sender]; balanceOf[msg.sender] = 0; (bool ok,) = msg.sender.call{value: amount}(""); require(ok, "claim"); }
}

contract RejectingCreator { receive() external payable { revert("no"); } }

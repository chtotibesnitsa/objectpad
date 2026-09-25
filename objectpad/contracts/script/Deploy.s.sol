// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import "../ObjectPadRegistry.sol";
import "../ObjectPadForge.sol";
import "../ObjectPadBurnEngine.sol";
import "../ObjectFeeVault.sol";
interface DeployVm {
    function envBool(string calldata) external returns (bool);
    function envAddress(string calldata) external returns (address);
    function envUint(string calldata) external returns (uint256);
    function envString(string calldata) external returns (string memory);
    function startBroadcast() external;
    function stopBroadcast() external;
}
/// @notice Operator-only script. Not executed by the application or automated checks.
/// Order: registry -> burn engine (requires the $OBJECTPAD Pons token and curve to exist) -> forge -> vault factory.
contract DeployObjectPad {
    DeployVm private constant vm = DeployVm(address(uint160(uint256(keccak256('hevm cheat code')))));
    address private constant PONS_FEE_ESCROW = 0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e;
    function run() external returns (ObjectPadRegistry registry, ObjectPadBurnEngine engine, ObjectPadForge forge, ObjectFeeVaultFactory factory) {
        require(vm.envBool('OBJECTPAD_DEPLOY_AUTHORIZED'), 'Explicit deployment authorization required');
        require(block.chainid == 4663, 'Wrong chain');
        address attestor = vm.envAddress('OBJECTPAD_ATTESTOR_ADDRESS');
        address guardian = vm.envAddress('OBJECTPAD_GUARDIAN_ADDRESS');
        address keeper = vm.envAddress('OBJECTPAD_BURN_KEEPER_ADDRESS');
        address objectpadToken = vm.envAddress('OBJECTPAD_TOKEN_ADDRESS');
        address objectpadCurve = vm.envAddress('OBJECTPAD_TOKEN_CURVE_ADDRESS');
        uint256 maxPerBurn = vm.envUint('OBJECTPAD_MAX_PER_BURN_WEI');
        string memory itemBaseUri = vm.envString('OBJECTPAD_ITEM_BASE_URI');
        require(attestor != address(0) && guardian != address(0) && keeper != address(0), 'Configure independent identities');
        vm.startBroadcast();
        registry = new ObjectPadRegistry(attestor, guardian);
        engine = new ObjectPadBurnEngine(objectpadToken, objectpadCurve, keeper, guardian, maxPerBurn);
        forge = new ObjectPadForge(address(registry), objectpadToken, itemBaseUri);
        factory = new ObjectFeeVaultFactory(address(registry), PONS_FEE_ESCROW, address(forge), address(engine));
        vm.stopBroadcast();
    }
}

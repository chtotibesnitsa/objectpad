// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import "../ObjectPadRegistry.sol";
import "./Mocks.sol";

contract ObjectPadRegistryTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256('hevm cheat code')))));
    uint256 private constant TEST_ONLY_KEY = 0xA11CE;
    ObjectPadRegistry private registry;
    address private creator = address(0xBEEF);
    bytes32 private constant ID = keccak256('controlled-test-fixture');
    bytes32 private constant META = keccak256('test-metadata-not-production');
    bytes32 private constant MODEL = keccak256('test-model-not-production');
    bytes32 private constant MANIFEST = keccak256('test-manifest-not-production');
    function setUp() public { registry = new ObjectPadRegistry(vm.addr(TEST_ONLY_KEY), address(this)); }
    function signature(bytes32 id, address who, uint256 deadline, string memory name, bytes32 model, bytes32 manifest) private returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(keccak256('Registration(bytes32 objectId,address creator,bytes32 nameHash,bytes32 metadataHash,bytes32 modelHash,bytes32 captureManifestHash,bytes32 uriHash,uint256 deadline)'), id, who, keccak256(bytes(name)), META, model, manifest, keccak256('ipfs://fixture'), deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEST_ONLY_KEY, keccak256(abi.encodePacked('\x19\x01', registry.DOMAIN_SEPARATOR(), structHash)));
        return abi.encodePacked(r, s, v);
    }
    function register(bytes32 id, string memory name, bytes32 model, bytes32 manifest) private {
        bytes memory sig = signature(id, creator, block.timestamp + 100, name, model, manifest);
        vm.prank(creator); registry.register(id, name, META, model, manifest, 'ipfs://fixture', block.timestamp + 100, sig);
    }
    function registerFixture() private { register(ID, 'Test vessel', MODEL, MANIFEST); }
    function testRegisterAndRejectReplay() public { registerFixture(); require(registry.exists(ID)); require(registry.creatorOf(ID) == creator); bytes memory sig = signature(ID, creator, block.timestamp + 100, 'Test vessel', MODEL, MANIFEST); vm.expectRevert(ObjectPadRegistry.AlreadyRegistered.selector); vm.prank(creator); registry.register(ID, 'Test vessel', META, MODEL, MANIFEST, 'ipfs://fixture', block.timestamp + 100, sig); }
    function testSignatureCannotBeStolenByAnotherWallet() public { bytes memory sig = signature(ID, creator, block.timestamp + 100, 'Test vessel', MODEL, MANIFEST); vm.expectRevert(ObjectPadRegistry.Unauthorized.selector); registry.register(ID, 'Test vessel', META, MODEL, MANIFEST, 'ipfs://fixture', block.timestamp + 100, sig); }
    function testNameIsBoundToSignature() public { bytes memory sig = signature(ID, creator, block.timestamp + 100, 'Test vessel', MODEL, MANIFEST); vm.expectRevert(ObjectPadRegistry.Unauthorized.selector); vm.prank(creator); registry.register(ID, 'Different vessel', META, MODEL, MANIFEST, 'ipfs://fixture', block.timestamp + 100, sig); }
    function testExpiry() public { uint256 deadline = block.timestamp + 100; bytes memory sig = signature(ID, creator, deadline, 'Test vessel', MODEL, MANIFEST); vm.warp(deadline + 1); vm.expectRevert(ObjectPadRegistry.Expired.selector); vm.prank(creator); registry.register(ID, 'Test vessel', META, MODEL, MANIFEST, 'ipfs://fixture', deadline, sig); }
    function testPauseIsGuardianOnly() public { vm.expectRevert(ObjectPadRegistry.Unauthorized.selector); vm.prank(creator); registry.setPaused(true); registry.setPaused(true); require(registry.paused()); }
    function testPauseDoesNotEraseRecords() public { registerFixture(); registry.setPaused(true); require(registry.exists(ID)); vm.prank(creator); registry.appendRevision(ID, META, 'ipfs://correction'); require(registry.revisionCount(ID) == 1); }
    function testRevisionCannotRewriteOriginal() public { registerFixture(); (, bytes32 original,,,) = registry.records(ID); vm.prank(creator); registry.appendRevision(ID, keccak256('revision'), 'ipfs://new'); (, bytes32 afterRevision,,,) = registry.records(ID); require(original == afterRevision); }
    function testRevisionIsCreatorOnly() public { registerFixture(); vm.expectRevert(ObjectPadRegistry.Unauthorized.selector); registry.appendRevision(ID, META, 'ipfs://new'); }
    function testSameModelCannotBeRegisteredTwice() public { registerFixture(); bytes32 other = keccak256('second-record'); bytes memory sig = signature(other, creator, block.timestamp + 100, 'Copy vessel', MODEL, keccak256('other-manifest')); vm.expectRevert(ObjectPadRegistry.DuplicateArtifact.selector); vm.prank(creator); registry.register(other, 'Copy vessel', META, MODEL, keccak256('other-manifest'), 'ipfs://fixture', block.timestamp + 100, sig); }
    function testSameCaptureManifestCannotBeRegisteredTwice() public { registerFixture(); bytes32 other = keccak256('second-record'); bytes memory sig = signature(other, creator, block.timestamp + 100, 'Copy vessel', keccak256('other-model'), MANIFEST); vm.expectRevert(ObjectPadRegistry.DuplicateArtifact.selector); vm.prank(creator); registry.register(other, 'Copy vessel', META, keccak256('other-model'), MANIFEST, 'ipfs://fixture', block.timestamp + 100, sig); }
    function testModelAndManifestMustDiffer() public { bytes memory sig = signature(ID, creator, block.timestamp + 100, 'Test vessel', MODEL, MODEL); vm.expectRevert(ObjectPadRegistry.InvalidRecord.selector); vm.prank(creator); registry.register(ID, 'Test vessel', META, MODEL, MODEL, 'ipfs://fixture', block.timestamp + 100, sig); }
    function testCreatorLinksMatchingTokenOnce() public {
        registerFixture(); MockToken token = new MockToken('Test vessel', address(0xC0FFEE));
        vm.prank(creator); registry.linkToken(ID, address(token));
        require(registry.tokenOf(ID) == address(token)); require(registry.objectOfToken(address(token)) == ID);
        MockToken second = new MockToken('Test vessel', address(0xC0FFEE));
        vm.expectRevert(ObjectPadRegistry.AlreadyLinked.selector); vm.prank(creator); registry.linkToken(ID, address(second));
    }
    function testLinkRejectsWrongNameOrStranger() public {
        registerFixture(); MockToken wrong = new MockToken('Impostor', address(0xC0FFEE));
        vm.expectRevert(ObjectPadRegistry.TokenMismatch.selector); vm.prank(creator); registry.linkToken(ID, address(wrong));
        MockToken right = new MockToken('Test vessel', address(0xC0FFEE));
        vm.expectRevert(ObjectPadRegistry.Unauthorized.selector); registry.linkToken(ID, address(right));
        MockToken noCurve = new MockToken('Test vessel', address(0));
        vm.expectRevert(ObjectPadRegistry.TokenMismatch.selector); vm.prank(creator); registry.linkToken(ID, address(noCurve));
    }
    function testOneTokenCannotBackTwoObjects() public {
        registerFixture(); register(keccak256('second'), 'Test vessel', keccak256('m2'), keccak256('c2'));
        MockToken token = new MockToken('Test vessel', address(0xC0FFEE));
        vm.prank(creator); registry.linkToken(ID, address(token));
        vm.expectRevert(ObjectPadRegistry.AlreadyLinked.selector); vm.prank(creator); registry.linkToken(keccak256('second'), address(token));
    }
}

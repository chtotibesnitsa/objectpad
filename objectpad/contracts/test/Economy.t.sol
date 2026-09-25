// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import "../ObjectPadRegistry.sol";
import "../ObjectPadForge.sol";
import "../ObjectPadBurnEngine.sol";
import "../ObjectFeeVault.sol";
import "./Mocks.sol";

/// @notice Controlled local-EVM tests for the crafting table, fee vaults and $OBJECTPAD buy-and-burn.
contract EconomyTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256('hevm cheat code')))));
    uint256 private constant KEY = 0xA11CE;
    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;
    ObjectPadRegistry private registry;
    ObjectPadForge private forge;
    ObjectPadBurnEngine private engine;
    ObjectFeeVaultFactory private factory;
    MockEscrow private escrow;
    MockCurve private opCurve;
    MockToken private op;
    MockToken private a; MockToken private b; MockToken private c;
    address private creator = address(0xBEEF);
    address private alice = address(0xA11);
    address private bob = address(0xB0B);
    address private keeper = address(0x4EE9);
    bytes32 private constant IDA = keccak256('object-a'); bytes32 private constant IDB = keccak256('object-b'); bytes32 private constant IDC = keccak256('object-c');
    uint256 private constant M = 1_000_000e18;

    receive() external payable {}

    function setUp() public {
        registry = new ObjectPadRegistry(vm.addr(KEY), address(this));
        opCurve = new MockCurve(); op = new MockToken('ObjectPad', address(opCurve)); opCurve.setToken(address(op));
        engine = new ObjectPadBurnEngine(address(op), address(opCurve), keeper, address(this), 1 ether);
        forge = new ObjectPadForge(address(registry), address(op), 'https://api.objectpad.example/api/items/');
        escrow = new MockEscrow();
        factory = new ObjectFeeVaultFactory(address(registry), address(escrow), address(forge), address(engine));
        a = launch(IDA, 'Vessel A'); b = launch(IDB, 'Vessel B'); c = launch(IDC, 'Vessel C');
        for (uint256 i; i < 3; i++) { MockToken t = i == 0 ? a : i == 1 ? b : c; t.mint(alice, 50 * M); t.mint(bob, 50 * M); vm.prank(alice); t.approve(address(forge), type(uint256).max); vm.prank(bob); t.approve(address(forge), type(uint256).max); }
        op.mint(alice, 10 * M); vm.prank(alice); op.approve(address(forge), type(uint256).max);
    }
    function launch(bytes32 id, string memory name) private returns (MockToken token) {
        bytes32 model = keccak256(abi.encode(id, 'model')); bytes32 manifest = keccak256(abi.encode(id, 'manifest')); bytes32 meta = keccak256(abi.encode(id, 'meta'));
        uint256 deadline = block.timestamp + 100;
        bytes32 structHash = keccak256(abi.encode(keccak256('Registration(bytes32 objectId,address creator,bytes32 nameHash,bytes32 metadataHash,bytes32 modelHash,bytes32 captureManifestHash,bytes32 uriHash,uint256 deadline)'), id, creator, keccak256(bytes(name)), meta, model, manifest, keccak256('ipfs://fixture'), deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, keccak256(abi.encodePacked('\x19\x01', registry.DOMAIN_SEPARATOR(), structHash)));
        vm.prank(creator); registry.register(id, name, meta, model, manifest, 'ipfs://fixture', deadline, abi.encodePacked(r, s, v));
        token = new MockToken(name, address(0xC0FFEE));
        vm.prank(creator); registry.linkToken(id, address(token));
    }
    function pair(MockToken x, MockToken y) private pure returns (address[] memory tokens) { tokens = new address[](2); tokens[0] = address(x); tokens[1] = address(y); }
    function amounts2(uint256 x, uint256 y) private pure returns (uint256[] memory list) { list = new uint256[](2); list[0] = x; list[1] = y; }

    // ---------------------------------------------------------------- crafting
    function testCraftLocksIngredientsAndMintsArtifact() public {
        vm.prank(alice); uint256 id = forge.craft(pair(a, b), amounts2(M, 2 * M), 0, 0);
        require(forge.ownerOf(id) == alice); require(a.balanceOf(address(forge)) == M); require(b.balanceOf(address(forge)) == 2 * M);
        (,, uint16 mult, uint8 count,) = forge.items(id); require(mult == 10_000 && count == 2);
        require(forge.itemsOf(alice).length == 1); require(forge.totalShares(address(a)) == M);
    }
    function testMultiplierMatchesPublishedPolicy() public view {
        require(forge.multiplierOf(2, 0, 0) == 10_000); require(forge.multiplierOf(3, 0, 0) == 12_500);
        require(forge.multiplierOf(3, 2, 2) == 27_500); require(forge.multiplierOf(2, 1, 1) == 17_500);
    }
    function testBurnTierSendsObjectpadToDeadAddress() public {
        address[] memory tokens = new address[](3); tokens[0] = address(a); tokens[1] = address(b); tokens[2] = address(c);
        uint256[] memory list = new uint256[](3); list[0] = M; list[1] = M; list[2] = M;
        vm.prank(alice); uint256 id = forge.craft(tokens, list, 2, 1);
        require(op.balanceOf(DEAD) == 100_000e18); (,, uint16 mult,, uint256 burned) = forge.items(id); require(mult == 25_000 && burned == 100_000e18);
        require(forge.totalShares(address(a)) == M * 25_000 / 10_000);
    }
    function testRejectsUnlinkedCoin() public {
        MockToken stray = new MockToken('Stray', address(0xC0FFEE)); stray.mint(alice, 5 * M); vm.prank(alice); stray.approve(address(forge), type(uint256).max);
        vm.expectRevert(ObjectPadForge.NotObjectCoin.selector); vm.prank(alice); forge.craft(pair(a, stray), amounts2(M, M), 0, 0);
    }
    function testRejectsDuplicateSmallOrOversizedRecipes() public {
        vm.expectRevert(ObjectPadForge.InvalidRecipe.selector); vm.prank(alice); forge.craft(pair(a, a), amounts2(M, M), 0, 0);
        vm.expectRevert(ObjectPadForge.InvalidRecipe.selector); vm.prank(alice); forge.craft(pair(a, b), amounts2(M - 1, M), 0, 0);
        address[] memory one = new address[](1); one[0] = address(a); uint256[] memory oneAmt = new uint256[](1); oneAmt[0] = M;
        vm.expectRevert(ObjectPadForge.InvalidRecipe.selector); vm.prank(alice); forge.craft(one, oneAmt, 0, 0);
        vm.expectRevert(ObjectPadForge.InvalidRecipe.selector); vm.prank(alice); forge.craft(pair(a, b), amounts2(M, M), 3, 0);
    }
    function testRejectsFeeOnTransferIngredient() public {
        bytes32 id = keccak256('object-tax'); string memory name = 'Tax vessel';
        bytes32 model = keccak256('tax-model'); bytes32 manifest = keccak256('tax-manifest'); uint256 deadline = block.timestamp + 100;
        bytes32 structHash = keccak256(abi.encode(keccak256('Registration(bytes32 objectId,address creator,bytes32 nameHash,bytes32 metadataHash,bytes32 modelHash,bytes32 captureManifestHash,bytes32 uriHash,uint256 deadline)'), id, creator, keccak256(bytes(name)), model, model == manifest ? model : model, manifest, keccak256('ipfs://fixture'), deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, keccak256(abi.encodePacked('\x19\x01', registry.DOMAIN_SEPARATOR(), structHash)));
        vm.prank(creator); registry.register(id, name, model, model, manifest, 'ipfs://fixture', deadline, abi.encodePacked(r, s, v));
        TaxToken tax = new TaxToken(name, address(0xC0FFEE)); vm.prank(creator); registry.linkToken(id, address(tax));
        tax.mint(alice, 5 * M); vm.prank(alice); tax.approve(address(forge), type(uint256).max);
        vm.expectRevert(ObjectPadForge.TransferFailed.selector); vm.prank(alice); forge.craft(pair(a, MockToken(address(tax))), amounts2(M, M), 0, 0);
    }
    function testDissolveRequiresLockThenReturnsEverything() public {
        vm.prank(alice); uint256 id = forge.craft(pair(a, b), amounts2(M, 3 * M), 1, 0);
        vm.expectRevert(ObjectPadForge.Locked.selector); vm.prank(alice); forge.dissolve(id);
        vm.warp(block.timestamp + 90 days);
        vm.prank(alice); forge.dissolve(id);
        require(a.balanceOf(alice) == 50 * M && b.balanceOf(alice) == 50 * M); require(forge.totalShares(address(a)) == 0); require(forge.itemsOf(alice).length == 0);
        vm.expectRevert(ObjectPadForge.UnknownItem.selector); forge.ownerOf(id);
    }
    function testOnlyOwnerMayClaimOrDissolve() public {
        vm.prank(alice); uint256 id = forge.craft(pair(a, b), amounts2(M, M), 0, 0);
        vm.expectRevert(ObjectPadForge.Unauthorized.selector); vm.prank(bob); forge.claim(id);
        vm.warp(block.timestamp + 31 days); vm.expectRevert(ObjectPadForge.Unauthorized.selector); vm.prank(bob); forge.dissolve(id);
    }

    // ------------------------------------------------------------ fee rewards
    function testRewardsSplitProRataByWeightedShares() public {
        vm.prank(alice); uint256 ia = forge.craft(pair(a, b), amounts2(M, M), 0, 0);      // 1.0x on A
        vm.prank(bob); uint256 ib = forge.craft(pair(a, c), amounts2(M, M), 2, 0);        // 2.0x on A
        vm.deal(address(this), 3 ether); forge.notifyReward{value: 3 ether}(address(a));
        require(forge.pending(ia) == 1 ether - 0 || forge.pending(ia) >= 1 ether - 1); require(forge.pending(ib) >= 2 ether - 1);
        uint256 before = alice.balance; vm.prank(alice); forge.claim(ia); require(alice.balance - before >= 1 ether - 1); require(forge.pending(ia) == 0);
    }
    function testLateCrafterDoesNotReceivePastRewards() public {
        vm.prank(alice); uint256 ia = forge.craft(pair(a, b), amounts2(M, M), 0, 0);
        vm.deal(address(this), 1 ether); forge.notifyReward{value: 1 ether}(address(a));
        vm.prank(bob); uint256 ib = forge.craft(pair(a, c), amounts2(M, M), 0, 0);
        require(forge.pending(ib) == 0); require(forge.pending(ia) >= 1 ether - 1);
    }
    function testRewardsFollowArtifactTransfer() public {
        vm.prank(alice); uint256 id = forge.craft(pair(a, b), amounts2(M, M), 0, 0);
        vm.deal(address(this), 1 ether); forge.notifyReward{value: 1 ether}(address(b));
        vm.prank(alice); forge.transferFrom(alice, bob, id);
        require(forge.ownerOf(id) == bob && forge.itemsOf(bob).length == 1 && forge.itemsOf(alice).length == 0);
        uint256 before = bob.balance; vm.prank(bob); forge.claim(id); require(bob.balance - before >= 1 ether - 1);
    }
    function testNotifyWithoutSharesReverts() public { vm.deal(address(this), 1 ether); vm.expectRevert(ObjectPadForge.NoShares.selector); forge.notifyReward{value: 1 ether}(address(a)); }

    // ------------------------------------------------------------- fee vaults
    function testVaultAddressIsPredictableBeforeDeployment() public {
        address predicted = factory.vaultOf(IDA); require(predicted.code.length == 0);
        address vault = factory.deploy(IDA); require(vault == predicted && vault.code.length > 0);
    }
    function testHarvestSplitsCreatorForgeAndBurn() public {
        vm.prank(alice); forge.craft(pair(a, b), amounts2(M, M), 0, 0);
        address vault = factory.vaultOf(IDA); vm.deal(address(this), 3 ether); escrow.accrue{value: 3 ether}(vault);
        uint256 creatorBefore = creator.balance;
        factory.harvest(IDA);
        require(creator.balance - creatorBefore == 1.0002 ether); require(address(forge).balance == 0.9999 ether); require(address(engine).balance == 0.9999 ether);
        require(ObjectFeeVault(payable(vault)).totalHarvested() == 3 ether);
    }
    function testForgeShareBurnsWhenNoArtifactHoldsCoin() public {
        address vault = factory.vaultOf(IDC); vm.deal(address(this), 4 ether); escrow.accrue{value: 4 ether}(vault);
        factory.harvest(IDC);
        require(address(forge).balance == 0); require(address(engine).balance == 2.6664 ether);
    }
    function testRejectingCreatorFallsBackToPullAndHarvestIsIdempotent() public {
        RejectingCreator rejecting = new RejectingCreator(); bytes32 id = keccak256('reject'); string memory name = 'Reject vessel';
        bytes32 model = keccak256('r-model'); bytes32 manifest = keccak256('r-manifest'); uint256 deadline = block.timestamp + 100;
        bytes32 structHash = keccak256(abi.encode(keccak256('Registration(bytes32 objectId,address creator,bytes32 nameHash,bytes32 metadataHash,bytes32 modelHash,bytes32 captureManifestHash,bytes32 uriHash,uint256 deadline)'), id, address(rejecting), keccak256(bytes(name)), model, model, manifest, keccak256('ipfs://fixture'), deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, keccak256(abi.encodePacked('\x19\x01', registry.DOMAIN_SEPARATOR(), structHash)));
        vm.prank(address(rejecting)); registry.register(id, name, model, model, manifest, 'ipfs://fixture', deadline, abi.encodePacked(r, s, v));
        address vault = factory.vaultOf(id); vm.deal(address(this), 2 ether); escrow.accrue{value: 2 ether}(vault);
        factory.harvest(id);
        require(ObjectFeeVault(payable(vault)).creatorOwed() == 0.6668 ether); require(vault.balance == 0.6668 ether);
        require(factory.harvest(id) == 0); require(address(engine).balance == 1.3332 ether);
        vm.expectRevert(ObjectFeeVault.Unauthorized.selector); ObjectFeeVault(payable(vault)).withdrawOwed();
    }
    function testUnknownObjectCannotDeployVault() public { vm.expectRevert(ObjectFeeVaultFactory.UnknownObject.selector); factory.deploy(keccak256('missing')); }

    // ----------------------------------------------------------- buy and burn
    function testKeeperBurnDeliversTokensToDeadAddress() public {
        vm.deal(address(this), 1 ether); (bool ok,) = address(engine).call{value: 0.5 ether}(""); require(ok);
        vm.prank(keeper); uint256 burned = engine.execute(0.2 ether, 1);
        require(burned == 0.2 ether * 1000); require(op.balanceOf(DEAD) == burned); require(op.balanceOf(address(engine)) == 0);
        require(engine.totalBurned() == burned && engine.totalEthSpent() == 0.2 ether && engine.burns() == 1);
    }
    function testBurnGuards() public {
        vm.deal(address(this), 3 ether); (bool ok,) = address(engine).call{value: 2 ether}(""); require(ok);
        vm.expectRevert(ObjectPadBurnEngine.Unauthorized.selector); engine.execute(0.1 ether, 1);
        vm.expectRevert(ObjectPadBurnEngine.InvalidAmount.selector); vm.prank(keeper); engine.execute(1.5 ether, 1);
        vm.expectRevert(ObjectPadBurnEngine.InvalidAmount.selector); vm.prank(keeper); engine.execute(0.1 ether, 0);
        opCurve.setGraduated(true); vm.expectRevert(ObjectPadBurnEngine.Graduated.selector); vm.prank(keeper); engine.execute(0.1 ether, 1);
    }
    function testKeeperRotationIsGuardianOnly() public {
        vm.expectRevert(ObjectPadBurnEngine.Unauthorized.selector); vm.prank(alice); engine.setKeeper(alice);
        engine.setKeeper(bob); require(engine.keeper() == bob);
    }
    function testEngineRejectsMismatchedCurve() public {
        MockCurve other = new MockCurve(); other.setToken(address(a));
        vm.expectRevert(ObjectPadBurnEngine.InvalidConfig.selector); new ObjectPadBurnEngine(address(op), address(other), keeper, address(this), 1 ether);
    }
}

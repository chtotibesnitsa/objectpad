// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IPonsTokenView { function name() external view returns (string memory); function curve() external view returns (address); }

/// @notice Non-upgradeable commitment registry. UNAUDITED; not a proof of title or physical uniqueness.
/// @dev Artifact uniqueness: a model hash or capture-manifest hash can be committed exactly once across the archive.
contract ObjectPadRegistry {
    address public immutable attestor;
    address public immutable guardian;
    bool public paused;
    uint16 public constant SCHEMA_VERSION = 2;
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 private constant TYPEHASH = keccak256("Registration(bytes32 objectId,address creator,bytes32 nameHash,bytes32 metadataHash,bytes32 modelHash,bytes32 captureManifestHash,bytes32 uriHash,uint256 deadline)");
    uint256 private constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    struct Record { address creator; bytes32 commitment; uint64 timestamp; bytes32 nameHash; address token; }
    mapping(bytes32 => Record) public records;
    mapping(bytes32 => uint256) public revisionCount;
    /// @notice Every model and capture-manifest hash ever committed. Prevents two records sharing an artifact.
    mapping(bytes32 => bytes32) public artifactOwner;
    /// @notice Reverse link from a launched token to its object record.
    mapping(address => bytes32) public objectOfToken;
    event ObjectRegistered(bytes32 indexed objectId,address indexed creator,string publicName,bytes32 metadataHash,bytes32 modelHash,bytes32 captureManifestHash,string metadataUri,uint256 timestamp,uint16 schemaVersion);
    event RevisionAppended(bytes32 indexed objectId,address indexed creator,uint256 revision,bytes32 revisionHash,string revisionUri);
    event TokenLinked(bytes32 indexed objectId,address indexed token,address indexed creator);
    event RegistrationPauseChanged(bool paused);
    error Unauthorized(); error InvalidRecord(); error AlreadyRegistered(); error Expired(); error Paused(); error DuplicateArtifact(); error AlreadyLinked(); error TokenMismatch();

    constructor(address attestor_, address guardian_) {
        if (attestor_ == address(0) || guardian_ == address(0)) revert InvalidRecord();
        attestor = attestor_; guardian = guardian_;
        DOMAIN_SEPARATOR = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("ObjectPad Registry"),keccak256("1"),block.chainid,address(this)));
    }
    function exists(bytes32 objectId) external view returns(bool) { return records[objectId].creator != address(0); }
    function creatorOf(bytes32 objectId) external view returns(address) { return records[objectId].creator; }
    function tokenOf(bytes32 objectId) external view returns(address) { return records[objectId].token; }
    function register(bytes32 objectId,string calldata publicName,bytes32 metadataHash,bytes32 modelHash,bytes32 captureManifestHash,string calldata metadataUri,uint256 deadline,bytes calldata signature) external {
        if (paused) revert Paused();
        if (records[objectId].creator != address(0)) revert AlreadyRegistered();
        if (block.timestamp > deadline) revert Expired();
        if (objectId == bytes32(0) || metadataHash == bytes32(0) || modelHash == bytes32(0) || captureManifestHash == bytes32(0) || modelHash == captureManifestHash || bytes(publicName).length < 2 || bytes(publicName).length > 96 || bytes(metadataUri).length < 1 || bytes(metadataUri).length > 1024 || signature.length != 65) revert InvalidRecord();
        if (artifactOwner[modelHash] != bytes32(0) || artifactOwner[captureManifestHash] != bytes32(0)) revert DuplicateArtifact();
        bytes32 nameHash = keccak256(bytes(publicName));
        bytes32 commitment = keccak256(abi.encode(TYPEHASH,objectId,msg.sender,nameHash,metadataHash,modelHash,captureManifestHash,keccak256(bytes(metadataUri)),deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01",DOMAIN_SEPARATOR,commitment));
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(signature.offset) s := calldataload(add(signature.offset,32)) v := byte(0,calldataload(add(signature.offset,64))) }
        if (uint256(s) > HALF_ORDER || (v != 27 && v != 28) || ecrecover(digest,v,r,s) != attestor) revert Unauthorized();
        records[objectId] = Record(msg.sender,commitment,uint64(block.timestamp),nameHash,address(0));
        artifactOwner[modelHash] = objectId; artifactOwner[captureManifestHash] = objectId;
        emit ObjectRegistered(objectId,msg.sender,publicName,metadataHash,modelHash,captureManifestHash,metadataUri,block.timestamp,SCHEMA_VERSION);
    }
    /// @notice The creator binds exactly one launched token to the record. The token name must equal the committed public name.
    function linkToken(bytes32 objectId,address token) external {
        Record storage record = records[objectId];
        if (record.creator == address(0) || record.creator != msg.sender) revert Unauthorized();
        if (record.token != address(0) || objectOfToken[token] != bytes32(0)) revert AlreadyLinked();
        if (token.code.length == 0 || keccak256(bytes(IPonsTokenView(token).name())) != record.nameHash || IPonsTokenView(token).curve() == address(0)) revert TokenMismatch();
        record.token = token; objectOfToken[token] = objectId;
        emit TokenLinked(objectId,token,msg.sender);
    }
    /// @notice Pauses new registration only; existing commitments, links and corrections remain readable.
    function setPaused(bool value) external { if (msg.sender != guardian) revert Unauthorized(); paused = value; emit RegistrationPauseChanged(value); }
    /// @notice Corrections are new events. Nothing changes the original commitment.
    function appendRevision(bytes32 objectId,bytes32 revisionHash,string calldata revisionUri) external {
        if (records[objectId].creator != msg.sender) revert Unauthorized();
        if (revisionHash == bytes32(0) || bytes(revisionUri).length < 1 || bytes(revisionUri).length > 1024) revert InvalidRecord();
        uint256 revision = ++revisionCount[objectId];
        emit RevisionAppended(objectId,msg.sender,revision,revisionHash,revisionUri);
    }
}

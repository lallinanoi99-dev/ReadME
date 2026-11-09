// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ReadMeGen Stamps
/// @notice Records a README fingerprint for a public GitHub repo at a given commit.
/// Anyone can stamp any repo; the proof page shows who stamped it.
contract ReadMeGenStamps {
    struct Stamp {
        address by;
        string repo;        // "owner/repo", lowercase, <= 100 chars
        bytes20 commit;     // git commit SHA-1
        bytes32 readmeHash; // SHA-256 of the README Markdown
        uint8 style;        // 0 Minimal · 1 Detailed · 2 Hackathon
        uint64 at;          // block timestamp
    }

    Stamp[] public stamps;
    mapping(bytes32 => uint256[]) private stampsForRepo;
    mapping(address => uint256[]) private stampsBy;

    event Stamped(uint256 indexed id, string repo, address indexed by, bytes32 readmeHash);

    error EmptyRepo();
    error RepoTooLong();
    error BadStyle();
    error NoStamps();

    function stamp(string calldata repo, bytes20 commit, bytes32 readmeHash, uint8 style)
        external
        returns (uint256 id)
    {
        uint256 len = bytes(repo).length;
        if (len == 0) revert EmptyRepo();
        if (len > 100) revert RepoTooLong();
        if (style > 2) revert BadStyle();

        id = stamps.length;
        stamps.push(Stamp(msg.sender, repo, commit, readmeHash, style, uint64(block.timestamp)));
        stampsForRepo[keccak256(bytes(repo))].push(id);
        stampsBy[msg.sender].push(id);

        emit Stamped(id, repo, msg.sender, readmeHash);
    }

    function getStamp(uint256 id) external view returns (Stamp memory) {
        return stamps[id];
    }

    function latestForRepo(string calldata repo) external view returns (uint256 id, Stamp memory s) {
        uint256[] storage ids = stampsForRepo[keccak256(bytes(repo))];
        if (ids.length == 0) revert NoStamps();
        id = ids[ids.length - 1];
        s = stamps[id];
    }

    function historyForRepo(string calldata repo) external view returns (uint256[] memory) {
        return stampsForRepo[keccak256(bytes(repo))];
    }

    function stampsOf(address who) external view returns (uint256[] memory) {
        return stampsBy[who];
    }

    function total() external view returns (uint256) {
        return stamps.length;
    }
}

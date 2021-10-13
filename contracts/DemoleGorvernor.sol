pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;
// SPDX-License-Identifier: UNLICENSED
import "./interfaces/IERC20.sol";

contract DemoleGorvernor {
    /// @notice The name of this contract
    string public constant name = "Demole Governor";

    /// @notice The number of votes in support of a proposal required in order for a quorum to be reached and for a vote to succeed
    function quorumVotes() public pure returns (uint256) {
        return 20000000e18;
    } // 20,000,000 = 4% of DMLG

    /// @notice The number of votes required in order for a voter to become a proposer
    function proposalThreshold() public pure returns (uint256) {
        return 5000000e18;
    } // 5,000,000 = 1% of DMLG

    /// @notice The maximum number of actions that can be included in a proposal
    function proposalMaxOperations() public pure returns (uint256) {
        return 10;
    } // 10 actions

    /// @notice The address of the governance token
    address public token;

    /// @notice The total number of proposals
    uint256 public proposalCount;

    struct Proposal {
        uint256 id;
        address proposer;
        address[] targets;
        uint256[] values;
        string[] signatures;
        bytes[] calldatas;
        uint256 startBlock;
        uint256 endBlock;
        uint256 forVotes;
        uint256 againstVotes;
        bool canceled;
        bool executed;
        mapping(address => VoterInfo) voters;
    }

    struct VoterInfo {
        bool hasVoted;
        bool support;
        uint256 tokenLocked;
    }

    /// @notice Possible states that a proposal may be in
    enum ProposalState {
        Active,
        Canceled,
        Defeated,
        Succeeded,
        Executed
    }

    /// @notice The official record of all proposals ever proposed
    mapping(uint256 => Proposal) public proposals;

    /// @notice The latest proposal for each proposer
    mapping(address => uint256) public latestProposalIds;

    /// @notice An event emitted when a new proposal is created
    event ProposalCreated(
        uint256 id,
        address proposer,
        address[] targets,
        uint256[] values,
        string[] signatures,
        bytes[] calldatas,
        uint256 startBlock,
        uint256 endBlock,
        string description
    );

    /// @notice An event emitted when a vote has been cast on a proposal
    event VoteCast(
        address voter,
        uint256 proposalId,
        bool support,
        uint256 votes
    );

    /// @notice An event emitted when a proposal has been canceled
    event ProposalCanceled(uint256 id);

    /// @notice An event emitted when a proposal has been executed in the Timelock
    event ProposalExecuted(uint256 id);

    /// @notice An event emitted when a proposal has been executed in the Timelock
    event UnlockedToken(uint256 proposalId, address voter, uint256 amount);

    uint public minPeriod = 28800;
    uint public maxPeriod = 864000;

    constructor(address _token, uint _minPeriod) public {
        token = _token;
        minPeriod = _minPeriod;
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        string[] memory signatures,
        bytes[] memory calldatas,
        string memory description,
        uint256 period
    ) public returns (uint256) {
        require(
            IERC20(token).transferFrom(
                msg.sender,
                address(this),
                proposalThreshold()
            ),
            "Governor::propose: proposer votes below proposal threshold"
        );
        require(
            targets.length == values.length &&
                targets.length == signatures.length &&
                targets.length == calldatas.length,
            "Governor::propose: proposal function information arity mismatch"
        );
        require(targets.length != 0, "Governor::propose: must provide actions");
        require(
            targets.length <= proposalMaxOperations(),
            "Governor::propose: too many actions"
        );
        require(
            period >= minPeriod && period <= maxPeriod,
            "Governor::propose: period not correct"
        );

        uint256 latestProposalId = latestProposalIds[msg.sender];
        if (latestProposalId != 0) {
            ProposalState proposersLatestProposalState = state(
                latestProposalId
            );
            require(
                proposersLatestProposalState != ProposalState.Active,
                "Governor::propose: one live proposal per proposer, found an already active proposal"
            );
        }

        uint256 startBlock = block.number;
        uint256 endBlock = add256(startBlock, period);

        proposalCount++;
        Proposal memory newProposal = Proposal({
            id: proposalCount,
            proposer: msg.sender,
            targets: targets,
            values: values,
            signatures: signatures,
            calldatas: calldatas,
            startBlock: startBlock,
            endBlock: endBlock,
            forVotes: 0,
            againstVotes: 0,
            canceled: false,
            executed: false
        });

        proposals[newProposal.id] = newProposal;
        latestProposalIds[newProposal.proposer] = newProposal.id;

        // save voter info for proposer
        proposals[newProposal.id].voters[msg.sender] = VoterInfo({
            hasVoted: true,
            support: true,
            tokenLocked: proposalThreshold()
        });

        emit ProposalCreated(
            newProposal.id,
            msg.sender,
            targets,
            values,
            signatures,
            calldatas,
            startBlock,
            endBlock,
            description
        );
        return newProposal.id;
    }

    function execute(uint256 proposalId) public payable {
        require(
            state(proposalId) == ProposalState.Succeeded,
            "GovernorAlpha::execute: proposal can only be execute if it is succeeded"
        );
        Proposal storage proposal = proposals[proposalId];
        proposal.executed = true;

        _execute(proposal.targets, proposal.values, proposal.signatures ,proposal.calldatas);

        emit ProposalExecuted(proposalId);
    }

    function _execute(address[] memory targets, uint256[] memory values, string[] memory signatures, bytes[] memory calldatas)
        internal
        virtual
    {
        for (uint256 i = 0; i < targets.length; ++i) {
            _executeTransaction(targets[i], values[i], signatures[i], calldatas[i]);
        }
    }

    function _executeTransaction(address target, uint value, string memory signature, bytes memory data) internal returns (bytes memory) {
        bytes memory callData;

        if (bytes(signature).length == 0) {
            callData = data;
        } else {
            callData = abi.encodePacked(bytes4(keccak256(bytes(signature))), data);
        }

        (bool success, bytes memory returnData) = target.call{value: value}(callData);
        require(success, "Governor::_executeTransaction: Transaction execution reverted.");

        return returnData;
    }

    function cancel(uint256 proposalId) public {
        ProposalState state = state(proposalId);
        require(
            state != ProposalState.Executed,
            "Governor::cancel: cannot cancel executed proposal"
        );

        Proposal storage proposal = proposals[proposalId];

        require(
            msg.sender == proposal.proposer,
            "Governor::cancel: msg.sender is not proposer"
        );

        proposal.canceled = true;

        // unlock token if proposer tokenLocked > 0
        if(proposal.voters[proposal.proposer].tokenLocked > 0) {
            unlockToken(proposalId);
        }

        emit ProposalCanceled(proposalId);
    }

    function getActions(uint256 proposalId)
        public
        view
        returns (address[] memory targets, uint256[] memory values, string[] memory signatures,  bytes[] memory calldatas)
    {
        Proposal storage p = proposals[proposalId];
        return (p.targets, p.values, p.signatures, p.calldatas);
    }

    function getVoterInfo(uint256 proposalId, address voter)
        public
        view
        returns (VoterInfo memory)
    {
        return proposals[proposalId].voters[voter];
    }

    function state(uint256 proposalId) public view returns (ProposalState) {
        require(
            proposalCount >= proposalId && proposalId > 0,
            "Governor::state: invalid proposal id"
        );
        Proposal storage proposal = proposals[proposalId];
        if (proposal.canceled) {
            return ProposalState.Canceled;
        } else if (block.number <= proposal.endBlock) {
            return ProposalState.Active;
        } else if (
            proposal.forVotes <= proposal.againstVotes ||
            proposal.forVotes < quorumVotes()
        ) {
            return ProposalState.Defeated;
        } else if (proposal.executed) {
            return ProposalState.Executed;
        } else {
            return ProposalState.Succeeded;
        }
    }

    function castVote(
        uint256 proposalId,
        uint256 amountVote,
        bool support
    ) public {
        return _castVote(msg.sender, proposalId, amountVote, support);
    }

    function _castVote(
        address voter,
        uint256 proposalId,
        uint256 amountVote,
        bool support
    ) internal {
        require(
            state(proposalId) == ProposalState.Active,
            "Governor::_castVote: voting is closed"
        );
        Proposal storage proposal = proposals[proposalId];
        VoterInfo storage voterInfo = proposal.voters[voter];
        require(
            voterInfo.hasVoted == false,
            "Governor::_castVote: voter already voted"
        );

        require(
            IERC20(token).balanceOf(voter) >= amountVote,
            "Governor::_castVote: amountVote not enough"
        );
        IERC20(token).transferFrom(voter, address(this), amountVote);

        if (support) {
            proposal.forVotes = add256(proposal.forVotes, amountVote);
        } else {
            proposal.againstVotes = add256(proposal.againstVotes, amountVote);
        }

        voterInfo.hasVoted = true;
        voterInfo.support = support;
        voterInfo.tokenLocked = amountVote;

        emit VoteCast(voter, proposalId, support, amountVote);
    }

    function unlockToken(uint256 proposalId) public {
        require(
            state(proposalId) != ProposalState.Active,
            "Governor::unlockToken: proposal is not ended"
        );

        Proposal storage proposal = proposals[proposalId];
        VoterInfo storage voterInfo = proposal.voters[msg.sender];

        require(
            voterInfo.tokenLocked > 0,
            "Governor::unlockToken: token locked is zero"
        );

        IERC20(token).transfer(msg.sender, voterInfo.tokenLocked);
        voterInfo.tokenLocked = 0;

        emit UnlockedToken(proposalId, msg.sender, voterInfo.tokenLocked);
    }

    function add256(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "addition overflow");
        return c;
    }

    function sub256(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "subtraction underflow");
        return a - b;
    }
}

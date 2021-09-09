pragma solidity ^0.6.12;
// SPDX-License-Identifier: UNLICENSED

import "./libraries/ERC20.sol";

contract DemoleToken is ERC20("Defi Monster Legends", "DMLG") {
    address public governance;

    modifier onlyGovernance() {
        require(msg.sender == governance, "DemoleToken: onlyGovernance");
        _;
    }

    constructor () public {
        _mint(msg.sender, 1000000000e18); // initial supply: 1000000000 DMLG
    }

    function mint(address account, uint256 amount) public onlyGovernance {
        _mint(account, amount);
    }

    function setGovernance (address _governance) public {
        require(governance == address(0), "setGovernance: governance is installed");
        governance = _governance;
    }

}
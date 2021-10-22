pragma solidity ^0.6.12;
// SPDX-License-Identifier: UNLICENSED

import "./interfaces/IERC721.sol";
import "./interfaces/IERC20.sol";

contract RegisterAndBuyNFT {
    address public governance;
    IERC721 public nftToken;
    IERC20 public erc20Token;
    mapping(address => uint256) public ticket;
    mapping(address => uint256) public lock;
    uint256 public uintToken;
    uint256 public dateLock;
    uint256 public indexNFT = 0;
    uint256 public indexNFTPre = 5000;

    constructor(
        address _nftToken,
        address _erc20Token,
        uint256 _uintToken,
        uint256 _dateLock
    ) public {
        nftToken = IERC721(_nftToken);
        erc20Token = IERC20(_erc20Token);
        governance = msg.sender;
        uintToken = _uintToken;
        dateLock = _dateLock;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "onlyGovernance");
        _;
    }

    function setGovernance(address _governance) external onlyGovernance {
        governance = _governance;
    }

    function setUintToken(uint256 _uintToken) external onlyGovernance {
        uintToken = _uintToken;
    }

    function setDateLock(uint256 _dateLock) external onlyGovernance {
        dateLock = _dateLock;
    }

    function register(uint256 _ticket) external {
        require(_ticket >= 1, "not enought");

        uint256 value = _ticket * uintToken;
        require(
            erc20Token.balanceOf(msg.sender) >= value,
            "balance not enough"
        );

        erc20Token.transferFrom(msg.sender, address(this), value);
        ticket[msg.sender] = ticket[msg.sender] + _ticket;
        lock[msg.sender] = now;
    }

    function withdrawToken() external {
        require(ticket[msg.sender] > 0, "not register");
        require(
            now >= lock[msg.sender] + dateLock * 24 * 60 * 60,
            "not enough days"
        );

        erc20Token.transfer(msg.sender, ticket[msg.sender] * uintToken);
        ticket[msg.sender] = 0;
    }

    function buyPreNFT() external {
        require(ticket[msg.sender] > 0, "not register");
        require(indexNFTPre <= 9999, "sold out");

        ticket[msg.sender] = ticket[msg.sender] - 2;
        erc20Token.transferFrom(msg.sender, address(this), 400);

        for (uint256 i = 0; i < 5; i++) {
            nftToken.transferFrom(governance, msg.sender, indexNFTPre);
            indexNFTPre++;
        }
    }

    function buyNFT() external {
        require(ticket[msg.sender] > 0, "not register");
        require(indexNFT <= 4999, "sold out");

        ticket[msg.sender] = ticket[msg.sender] - 1;
        erc20Token.transferFrom(msg.sender, address(this), 200);

        for (uint256 i = 0; i < 5; i++) {
            nftToken.transferFrom(governance, msg.sender, indexNFT);
            indexNFT++;
        }
    }
}

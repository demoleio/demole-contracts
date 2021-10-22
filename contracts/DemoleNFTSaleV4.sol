pragma solidity ^0.6.12;
// SPDX-License-Identifier: UNLICENSED

import "./interfaces/IERC721.sol";
import "./interfaces/IERC20.sol";

contract DemoleNFTSaleV4 {
    address public governance;
    IERC721 public nft;
    IERC20 public token;

    struct User {
        uint256 amountTicket;
        uint256 lockedAt;
    }

    mapping (address => User) public users;

    struct SaleInfo {
        uint256 price;
        uint256 amountTicketRequire;
        uint256[] tokenIds;
    }

    // false = NFT normal, true = NFT premium
    mapping (bool => SaleInfo) public saleInfo;

    uint256 public amountTokenPerTicket = 1000 * 10**18;        // 1000 DMLG
    uint256 public lockTime = 14 * 24 * 60 * 60;                // 14 days
    
    uint256 public openSaleAt;
    bool public isCloseSale = false;
    bool public isCloseRegister = false;
    
    event Register(address indexed user, uint256 amountTicket);
    event Buy(address indexed user, bool nftType, uint256[] tokenIds);

    constructor(
        address _nft,
        address _token
    ) public {
        nft = IERC721(_nft);
        token = IERC20(_token);
        governance = msg.sender;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "onlyGovernance");
        _;
    }

    function register(uint256 _amountTicket) external {
        require(isCloseRegister == false, "register is closed");
        require(_amountTicket >= 1, "min ticket is 1");

        uint256 amountTokenRequire = _amountTicket * amountTokenPerTicket;

        require(
            token.balanceOf(msg.sender) >= amountTokenRequire,
            "balance not enough"
        );

        require(token.transferFrom(msg.sender, address(this), amountTokenRequire), "transferFrom token failed");

        users[msg.sender].amountTicket = users[msg.sender].amountTicket + _amountTicket;
        users[msg.sender].lockedAt = now;

        emit Register(msg.sender, _amountTicket);
    }

    function unlock() external {
        require(users[msg.sender].amountTicket > 0, "amount ticket is zero");
        require(
            now >= users[msg.sender].lockedAt + lockTime,
            "not time to unlock"
        );

        token.transfer(msg.sender, users[msg.sender].amountTicket * amountTokenPerTicket);

        users[msg.sender].amountTicket = 0;
    }

    // _nftType == false -> NFT normal
    // _nftType == true -> NFT premium
    function buy(bool _nftType) external {
        require(now >= openSaleAt && isCloseSale == false, "not time to buy");

        SaleInfo storage info = saleInfo[_nftType];
        require(users[msg.sender].amountTicket >= info.amountTicketRequire, "not enough ticket");
        require(info.tokenIds.length > 0, "sold out");

        users[msg.sender].amountTicket = users[msg.sender].amountTicket - info.amountTicketRequire;

        require(token.transferFrom(msg.sender, address(this), info.price), "transfer token failed");

        uint256[] storage tokenIdsSold;

        for (uint256 i = info.tokenIds.length - 1; i >= info.tokenIds.length - 5; i--) {
            nft.transferFrom(governance, msg.sender, info.tokenIds[i]);
            info.tokenIds.pop();

            tokenIdsSold.push(info.tokenIds[i]);
        }

        emit Buy(msg.sender, _nftType, tokenIdsSold);
    }

    // ADMIN FUNCTIONS
    function setGovernance(address _governance) external onlyGovernance {
        governance = _governance;
    }

    function setAmountTokenPerTicket(uint256 _amountTokenPerTicket) external onlyGovernance {
        amountTokenPerTicket = _amountTokenPerTicket;
    }

    function setLockTime(uint256 _lockTime) external onlyGovernance {
        lockTime = _lockTime;
    }

    function setOpenSaleAt(uint256 _openSaleAt) external onlyGovernance {
        openSaleAt = _openSaleAt;
    }

    function setClose(bool _isCloseSale, bool _isCloseRegister) external onlyGovernance {
        isCloseSale = _isCloseSale;
        isCloseRegister = _isCloseRegister;
    }

    // _nftType == false -> NFT normal
    // _nftType == true -> NFT premium
    function setSaleInfo (bool _nftType, uint256 _price, uint256 _amountTicketRequire) external onlyGovernance {
        saleInfo[_nftType].price = _price;
        saleInfo[_nftType].amountTicketRequire = _amountTicketRequire;
    }

    // _nftType == false -> NFT normal
    // _nftType == true -> NFT premium
    function pushTokenIds (bool _nftType, uint256[] memory _tokenIds) external onlyGovernance {
        for(uint i; i < _tokenIds.length; i++) {
            saleInfo[_nftType].tokenIds.push(_tokenIds[i]);
        }
    }
}

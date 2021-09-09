pragma solidity ^0.6.12;
// SPDX-License-Identifier: UNLICENSED

import "./libraries/Ownable.sol";
import "./libraries/SafeMath.sol";
import "./libraries/PancakeLibrary.sol";
import "./interfaces/IERC721.sol";
import "./libraries/MerkleProof.sol";

contract DemoleNFTSaleV2 is Ownable {
    using SafeMath for uint;

    uint public usdtPrice = 50 * 10**18; // $50
    address public pancakeFactory;
    address public WBNB;
    address public USDT;

    IERC721 public NFT;

    bytes32 public merkleRoot;
    uint public openTime;
    uint public closeTime;
    uint public totalSale;
    uint public totalSold;

    mapping(address => bool) public ordered; // ordered[address] = true is ordered
    mapping(address => bool) public transfered; // transfered[address] = true is transfered

    event Order(address indexed user, uint value);
    event Bought(address indexed user, uint tokenId, uint value);

    constructor (address _pancakeFatory, address _WBNB, address _USDT, address _nftAddress) public {
        pancakeFactory = _pancakeFatory;
        WBNB = _WBNB;
        USDT = _USDT;
        NFT = IERC721(_nftAddress);
    }

    function order(address _user, bytes32[] memory _merkleProof) public payable returns(bool) {
        // production
        uint BNBPrice = getBNBPrice();
        require(msg.value >= BNBPrice, "buy: msg.value not enough");
        require(block.timestamp >= openTime && block.timestamp < closeTime, "buy: sale is not open");
        require(ordered[_user] == false, "buy: msg.sender is ordered");
        require(_verify(_user, _merkleProof), "buy: incorrect merkle proof");
        require(totalSold < totalSale, "buy: out of stock");

        ordered[_user] = true;

        emit Order(_user, msg.value);
        return true;
    }

    function getBNBPrice () public view returns(uint) {
        (uint reserveIn, uint reserveOut) = PancakeLibrary.getReserves(pancakeFactory, USDT, WBNB);
        return PancakeLibrary.getAmountOut(usdtPrice, reserveIn, reserveOut);
    }

    function _verify(address _user, bytes32[] memory _merkleProof) private view returns(bool) {
        bytes32 leaf = keccak256(abi.encodePacked(_user));
        return MerkleProof.verify(_merkleProof, merkleRoot, leaf);
    }

    // only owner functions
    function transferNFT(address _user, uint _tokenId, uint _value) public onlyOwner {
        require(transfered[_user] == false, "transferNFT: transfered");
        
        NFT.transferFrom(owner(), _user, _tokenId);
        transfered[_user] = true;
        totalSold = totalSold.add(1);

        emit Bought(_user, _tokenId, _value);
    }

    function startSale(bytes32 _merkleRoot, uint _totalSale) public onlyOwner {
        merkleRoot = _merkleRoot;
        totalSale = _totalSale;
        totalSold = 0;
    }

    function setTime(uint _openTime, uint _closeTime) public onlyOwner {
        openTime = _openTime;
        closeTime = _closeTime;
    }

    function setUsdtPrice(uint _usdtPrice) public onlyOwner {
        usdtPrice = _usdtPrice;
    }

    function withdraw() public onlyOwner {
        address payable receiver = payable(owner());
        receiver.transfer(address(this).balance);
    }
}
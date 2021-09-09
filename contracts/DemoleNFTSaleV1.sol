pragma solidity ^0.6.12;
// SPDX-License-Identifier: UNLICENSED

import "./libraries/Ownable.sol";
import "./libraries/SafeMath.sol";
import "./libraries/PancakeLibrary.sol";
import "./interfaces/IERC721.sol";
import "./libraries/MerkleProof.sol";

contract DemoleNFTSaleV1 is Ownable {

    using SafeMath for uint;

    uint public usdtPrice = 50 * 10**18; // $50
    address public pancakeFactory;
    address public WBNB;
    address public USDT;

    IERC721 public NFT;

    mapping(uint => mapping(address => bool)) public bought; // bought[round][address] = true //is bought
    mapping(uint => bytes32) public merkleRoots;
    mapping(uint => bool) public isOpen;

    event StartSale(uint round, bytes32 merkleRoot);
    event CloseSale(uint round);
    event Bought(address indexed user, uint round, uint tokenId,uint BNBValue);

    constructor (address _pancakeFatory, address _WBNB, address _USDT, address _nftAddress) public {
        pancakeFactory = _pancakeFatory;
        WBNB = _WBNB;
        USDT = _USDT;
        NFT = IERC721(_nftAddress);
    }

    function buy(address _user, uint _round, uint _tokenId, bytes32[] memory _merkleProof) public payable returns(bool) {
        // production
        uint BNBPrice = getBNBPrice();
        require(msg.value >= BNBPrice, "buy: msg.value not enough");
        require(isOpen[_round], "buy: round is not open");
        require(bought[_round][_user] == false, "buy: msg.sender is bought");
        require(_verify(_user, _round, _tokenId, _merkleProof), "buy: incorrect merkle proof");

        address owner = owner();
        NFT.transferFrom(owner, _user, _tokenId);

        emit Bought(_user, _round, _tokenId, BNBPrice);
        return true;
    }

    function getBNBPrice () public view returns(uint) {
        (uint reserveIn, uint reserveOut) = PancakeLibrary.getReserves(pancakeFactory, USDT, WBNB);
        return PancakeLibrary.getAmountOut(usdtPrice, reserveIn, reserveOut);
    }

    function _verify(address _user, uint _round,uint _tokenId, bytes32[] memory _merkleProof) private view returns(bool) {
        bytes32 leaf = keccak256(abi.encodePacked(_user, _tokenId));
        return MerkleProof.verify(_merkleProof, merkleRoots[_round], leaf);
    }

    // only owner functions
    function startSale(uint _round, bytes32 _merkleRoot) public onlyOwner {
        merkleRoots[_round] = _merkleRoot;
        isOpen[_round] = true;

        emit StartSale(_round, _merkleRoot);
    }

    function closeSale(uint _round) public onlyOwner {
        isOpen[_round] = false;

        emit CloseSale(_round);
    }

    function setUsdtPrice(uint _usdtPrice) public onlyOwner {
        usdtPrice = _usdtPrice;
    }

    function withdraw() public onlyOwner {
        address payable receiver = payable(owner());
        receiver.transfer(address(this).balance);
    }
}
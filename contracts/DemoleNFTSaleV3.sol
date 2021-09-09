pragma solidity ^0.6.12;
// SPDX-License-Identifier: UNLICENSED

import "./libraries/Ownable.sol";
import "./libraries/SafeMath.sol";
import "./libraries/PancakeLibrary.sol";
import "./interfaces/IERC721.sol";
import "./libraries/MerkleProof.sol";
import "@chainlink/contracts/src/v0.6/VRFConsumerBase.sol";

contract DemoleNFTSaleV3 is Ownable, VRFConsumerBase {
    uint256 public usdtPrice = 50 * 10**6; // $50
    address public pancakeFactory;
    address public WBNB;
    address public USDT;

    IERC721 public NFT;

    bytes32 public merkleRoot;
    uint256 public openTime;
    uint256 public closeTime;
    uint256 public totalSale;
    uint256 public totalSold;

    mapping(address => bool) public ordered; // ordered[address] = true is ordered

    uint256[] public tokenIds;
    bytes32 internal keyHash;
    uint256 internal fee;

    mapping (bytes32 => address) public requestIdToSender;
    mapping (bytes32 => uint256) public requestIdToValue;

    event Order(address indexed user, uint256 value, bytes32 requestId);
    event Bought(address indexed user, uint256 tokenId, uint256 value);

    constructor(
        address _pancakeFatory,
        address _WBNB,
        address _USDT,
        address _nftAddress
    )
        public
        VRFConsumerBase(
            0x3d2341ADb2D31f1c5530cDC622016af293177AE0,     // VRF Coordinator
            0xb0897686c545045aFc77CF20eC7A532E3120E0F1      // LINK Token
        )
    {
        pancakeFactory = _pancakeFatory;
        WBNB = _WBNB;
        USDT = _USDT;
        NFT = IERC721(_nftAddress);

        keyHash = 0xf86195cf7690c55907b2b611ebb7343a6f649bff128701cc542f0569e2c549da;
        fee = 0.0001 * 10 ** 18; // 0.0001 LINK
    }

    function order(address _user, bytes32[] memory _merkleProof)
        public
        payable
        returns (bool)
    {
        // production
        uint256 BNBPrice = getBNBPrice();
        require(msg.value >= BNBPrice, "buy: msg.value not enough");
        require(
            block.timestamp >= openTime && block.timestamp < closeTime,
            "buy: sale is not open"
        );
        require(ordered[_user] == false, "buy: msg.sender is ordered");
        require(_verify(_user, _merkleProof), "buy: incorrect merkle proof");
        require(totalSold < totalSale, "buy: out of stock");

        bytes32 requestId = _getRandomNumber();
        requestIdToSender[requestId] = _user;
        requestIdToValue[requestId] = msg.value;

        ordered[_user] = true;

        emit Order(_user, msg.value, requestId);
        return true;
    }

    function _getRandomNumber() internal returns (bytes32 requestId) {
        return requestRandomness(keyHash, fee);
    }

    function fulfillRandomness(bytes32 requestId, uint256 randomNumber) internal override {
        address _user = requestIdToSender[requestId];
        uint256 _value = requestIdToValue[requestId];

        // random number index in array tokenIds
        uint256 randomNumberIndex = (randomNumber % tokenIds.length) + 0;

        // swap and pop. swap tokenIds[randomNumberIndex] <-> tokenIds[length - 1] and delete tokenIds[length - 1]
        uint256 tokenIdSale = tokenIds[randomNumberIndex];
        uint256 temp = tokenIds[tokenIds.length - 1];
        tokenIds[tokenIds.length - 1] = tokenIds[randomNumberIndex];
        tokenIds[randomNumberIndex] = temp;

        // transfer NFT
        _transferNFT(_user, tokenIdSale, _value);

        // set state
        ordered[_user] = true;
        tokenIds.pop();
    }

    function _transferNFT(
        address _user,
        uint256 _tokenId,
        uint256 _value
    ) internal {
        NFT.transferFrom(owner(), _user, _tokenId);
        totalSold = totalSold.add(1);

        emit Bought(_user, _tokenId, _value);
    } 

    function getBNBPrice() public view returns (uint256) {
        (uint256 reserveIn, uint256 reserveOut) = PancakeLibrary.getReserves(
            pancakeFactory,
            USDT,
            WBNB
        );
        return PancakeLibrary.getAmountOut(usdtPrice, reserveIn, reserveOut);
    }

    function _verify(address _user, bytes32[] memory _merkleProof)
        private
        view
        returns (bool)
    {
        bytes32 leaf = keccak256(abi.encodePacked(_user));
        return MerkleProof.verify(_merkleProof, merkleRoot, leaf);
    }

    // only owner functions
    function pushTokenIds(uint256 _amount, bool _reset) public onlyOwner {
        if(_reset) {
            tokenIds = new uint256[](0);
        }

        uint currentLength = tokenIds.length;

        for(uint256 i; i < _amount; i++) {
            tokenIds.push(currentLength + i);
        }
    }

    function startSale(
        bytes32 _merkleRoot,
        uint256 _totalSale
    ) public onlyOwner {
        merkleRoot = _merkleRoot;
        totalSale = _totalSale;
        totalSold = 0;
    }

    function setTime(uint256 _openTime, uint256 _closeTime) public onlyOwner {
        openTime = _openTime;
        closeTime = _closeTime;
    }

    function setUsdtPrice(uint256 _usdtPrice) public onlyOwner {
        usdtPrice = _usdtPrice;
    }

    function withdraw() public onlyOwner {
        address payable receiver = payable(owner());
        receiver.transfer(address(this).balance);
    }

    function withdrawLINK() public onlyOwner {
        address receiver = owner();
        LINK.transfer(receiver, LINK.balanceOf(address(this)));
    }
}

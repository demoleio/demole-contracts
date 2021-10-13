// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract DemoleNFT is ERC721, ERC721Enumerable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdCounter;

    address public governance;
    string public baseURI;

    modifier onlyGovernance() {
        require(msg.sender == governance, "DemoleNFT: onlyGovernance");
        _;
    }

    constructor() ERC721("DemoleNFT", "DMLGNFT") {
        governance = msg.sender;
        baseURI = "https://nft-api.demole.io/";
    }
    
    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    function safeMint(address _to) public onlyGovernance {
        _safeMint(_to, _tokenIdCounter.current());
        _tokenIdCounter.increment();
    }

    function multipleMint(address _to, uint _amount) public onlyGovernance {
        for(uint i = 0; i < _amount; i++) {
            _safeMint(_to, _tokenIdCounter.current());
            _tokenIdCounter.increment();
        }
    }

    function setGovernance (address _governance) public onlyGovernance {
        governance = _governance;
    }

    function setBaseURI (string memory _uri) public onlyGovernance {
        baseURI = _uri;
    }

    // The following functions are overrides required by Solidity.
    function _beforeTokenTransfer(address from, address to, uint256 tokenId)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
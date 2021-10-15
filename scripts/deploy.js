const hre = require('hardhat')

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const ownerCut = 1000

module.exports = async function() {
    const accounts = await hre.web3.eth.getAccounts();
    // deploy token
    const Token = await hre.artifacts.require("DemoleToken");
    const token = await Token.new();

    // deploy gorvernor
    // params: [token address, min period]
    const Gorvernor = await hre.artifacts.require("DemoleGorvernor");
    const gorvernor = await Gorvernor.new(token.address, 10);

    // set gorvernor address into token contract
    // params: [gorvernor address]
    token.setGovernance(gorvernor.address)

    // deploy token sale
    // params: [token address]
    const TokenSale = await hre.artifacts.require("DemoleTokenSale");
    const tokenSale = await TokenSale.new(token.address)

    // deploy nft
    const NFT = await hre.artifacts.require("DemoleNFT");
    const nft = await NFT.new()

    // deploy nftSale
    const NFTSale = await hre.artifacts.require("DemoleNFTSaleV1Test"); 
    const nftSale = await NFTSale.new(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, nft.address)

    // delpoy market
    // params: [nft address]
    const Market = await hre.artifacts.require("DemoleMarketplace");
    const market = await Market.new(nft.address, ownerCut)

    return {token, gorvernor, tokenSale, nft, nftSale, market}
}
const { expect, assert } = require("chai");
const { web3 } = require("hardhat");
const { default: MerkleTree } = require("merkletreejs");
const deploy = require("../scripts/deploy");
const { numberToHex, padLeft, stripHexPrefix, stringToHex, toBN, toWei } = require("web3-utils");
const keccak256 = require('keccak256');
const { utils } = require("web3");
const { BigNumber } = require("ethers");

function increaseBlock() {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({ method: "evm_mine", params: [] }, (error, res) => {
            if (error) return reject(error)
            resolve(res)
        })
    })
}


describe("RegisterAndBuyNFT", () => {
    let accounts;
    let contracts;

    before(async function () {
        accounts = await web3.eth.getAccounts();
        contracts = await deploy();

        await contracts.nft.multipleMint(accounts[0], 20)
        await contracts.nft.setApprovalForAll(contracts.registerAndBuyNFT.address, true)
        await contracts.token.mint(accounts[1], 5000, { from: accounts[0] })
    });

    it("register success", async () => {

        await contracts.token.approve(contracts.registerAndBuyNFT.address, 1000, { from: accounts[1] })

        await contracts.registerAndBuyNFT.register(1, { from: accounts[1] })

        const lock = await contracts.registerAndBuyNFT.lock(accounts[1])
        assert.equal(await contracts.registerAndBuyNFT.ticket(accounts[1]), 1)

    })

    // it("withdrawToken success", async () => {
    //     await contracts.registerAndBuyNFT.withdrawToken(1)
    // })

    it("buyNFT success", async () => {
        await contracts.token.approve(contracts.registerAndBuyNFT.address, 1000, { from: accounts[1] })


        const ticket = await contracts.registerAndBuyNFT.ticket(accounts[1])
        const tokens = await contracts.nft.balanceOf(accounts[1])

        await contracts.registerAndBuyNFT.buyNFT({ from: accounts[1] })

        const ticketAfter = await contracts.registerAndBuyNFT.ticket(accounts[1])
        const tokensAfter = await contracts.nft.balanceOf(accounts[1])

        assert.equal(ticketAfter, ticket - 1)
        assert.equal(tokens, tokensAfter - 5)
    })
})
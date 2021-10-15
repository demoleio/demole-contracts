const { expect, assert } = require("chai");
const { web3 } = require("hardhat");
const deploy = require("../scripts/deploy");

describe("Test Marketplace", () => {
    let accounts;
    let contracts;

    before(async function () {
        accounts = await web3.eth.getAccounts();
        contracts = await deploy();
    });

    async function sell(tokenId, startPrice = 1, endPrice = 2, duration = 300) {
        await contracts.nft.multipleMint(accounts[0], 50)
        await contracts.nft.setApprovalForAll(contracts.market.address, true);
        await contracts.market.createAuction(tokenId, startPrice, endPrice, duration, { from: accounts[0] })
    }


    it("can't sell item when token not exists", async () => {
        try {
            await contracts.market.createAuction(1, 1, 2, 300)
        } catch (error) {
            assert.include(error.message, "ERC721: owner query for nonexistent token")
        }
    })

    it("can't sell item when not owner of tokenId", async () => {
        try {
            await contracts.nft.multipleMint(accounts[0], 50)
            await contracts.market.createAuction(1, 1, 2, 300, { from: accounts[1] })
        } catch (error) {
            assert.include(error.message, "seller is not owner of tokenId")
        }
    })

    it("can't sell item when not approve", async () => {
        try {
            await contracts.nft.multipleMint(accounts[0], 50)
            await contracts.market.createAuction(1, 1, 2, 300, { from: accounts[0] })
        } catch (error) {
            assert.include(error.message, "ERC721: transfer caller is not owner nor approved")
        }
    })

    it("can't sell item when duration less 1 minute", async () => {
        try {
            await sell(0, 1, 2, 1)
        } catch (error) {
            assert.include(error.message, "_addAuction: duration must greater than 1 minute")
        }
    })

    it("sell success", async () => {
        await sell(0)

        await contracts.market.getAuction(0)
    })

    it("can't cancel item when token not sell", async () => {
        try {
            await contracts.market.cancelAuction(1)
        } catch (error) {
            assert.include(error.message, "cancelAuction: auction is not exists")
        }
    })

    it("can't cancel item when msg.sender is not seller", async () => {
        try {
            await sell(1)
            await contracts.market.cancelAuction(1, { from: accounts[1] })
        } catch (error) {
            assert.include(error.message, "cancelAuction: msg.sender is not seller")
        }
    })

    it("cancel success", async () => {
        await sell(2)

        await contracts.market.cancelAuction(1, { from: accounts[0] })
    })

    it("can't bid item when token not sell", async () => {
        try {
            await contracts.market.bid(1)
        } catch (error) {
            assert.include(error.message, "_bid: auction is not exists")
        }
    })

    it("can't bid item when balance not enought", async () => {
        try {
            var balance = await web3.eth.getBalance(accounts[0])
            await sell(3, balance + web3.utils.toWei("1000"), balance + web3.utils.toWei("1000"))
            await contracts.market.bid(3)
        } catch (error) {
            assert.include(error.message, "_bid: msg.value less than price")
        }
    })

    it("can't bid item when msg.value not enought", async () => {
        try {
            await sell(4, web3.utils.toWei("9999"), web3.utils.toWei("9999"))
            await contracts.market.bid(4, { value: web3.utils.toWei("1", "ether") })
        } catch (error) {
            assert.include(error.message, "_bid: msg.value less than price")
        }
    })

    it("bid success", async () => {
        await sell(5)
        await contracts.market.bid(5, { value: web3.utils.toWei("1", "ether") })
    })

})
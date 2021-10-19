const { expect, assert } = require("chai");
const { web3 } = require("hardhat");
const deploy = require("../scripts/deploy");
const { hexToNumber } = require("web3-utils");
describe("Test Marketplace", () => {
    let accounts;
    let contracts;

    before(async function () {
        accounts = await web3.eth.getAccounts();
        contracts = await deploy();
        await contracts.nft.multipleMint(accounts[0], 50)
    });

    async function sell(tokenId, startPrice = 1, endPrice = 2, duration = 300) {
        await contracts.nft.setApprovalForAll(contracts.market.address, true)
        await contracts.market.createAuction(tokenId, startPrice, endPrice, duration, { from: accounts[0] })
    }


    it("can't sell item when token not exists", async () => {
        try {
            await contracts.market.createAuction(51, 1, 2, 300)
        } catch (error) {
            assert.include(error.message, "ERC721: owner query for nonexistent token")
        }
    })

    it("can't sell item when not owner of tokenId", async () => {
        try {
            await contracts.market.createAuction(1, 1, 2, 300, { from: accounts[1] })
        } catch (error) {
            assert.include(error.message, "seller is not owner of tokenId")
        }
    })

    it("can't sell item when not approve", async () => {
        try {
            await contracts.market.createAuction(0, 1, 2, 300)
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
        assert.equal(await contracts.nft.ownerOf(0), contracts.market.address)
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
        try {
            await sell(2)
            await contracts.market.cancelAuction(2, { from: accounts[0] })
            assert.equal(await contracts.nft.ownerOf(2), accounts[0])
            await contracts.market.getAuction(2)
        } catch (error) {
            assert.include(error.message, "getAuction: auction is not exists")
        }
    })

    it("can't bid item when token not sell", async () => {
        try {
            await contracts.market.bid(51)
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
        await sell(5, web3.utils.toWei("1", "ether"), web3.utils.toWei("1", "ether"))

        const balanceBuyer = await web3.eth.getBalance(accounts[1])
        const balanceSeller = await web3.eth.getBalance(accounts[0])
        const balanceMarket = await web3.eth.getBalance(contracts.market.address)

        const tx = await contracts.market.bid(5, { from: accounts[1], value: web3.utils.toWei("10", "ether") })
        const gas = tx.receipt.gasUsed * hexToNumber(tx.receipt.effectiveGasPrice)

        const balanceAfterBid = await web3.eth.getBalance(accounts[1])
        const balanceAfterSell = await web3.eth.getBalance(accounts[0])
        const balanceMarketAfter = await web3.eth.getBalance(contracts.market.address)

        // sellerProceeds = price - ((price * 1000) / 10000)
        const sellerProceeds = web3.utils.toWei("1") - ((web3.utils.toWei("1") * 1000) / 10000)
        // marketProceeds = price - sellerProceeds
        const marketProceeds = web3.utils.toWei("1") - sellerProceeds

        assert.equal(await contracts.nft.ownerOf(5), accounts[1])

        // check banlance buyer
        // balanceAfterBid = balanceBefore - price - gas
        assert.equal(web3.utils.fromWei(balanceAfterBid), web3.utils.fromWei(balanceBuyer) - 1 - web3.utils.fromWei(gas.toString()))

        // check balance seller
        // balanceAfterSell = balanceBefore + sellerProceeds
        assert.equal(web3.utils.fromWei(balanceAfterSell), parseFloat(web3.utils.fromWei(balanceSeller)) + parseFloat(web3.utils.fromWei(sellerProceeds.toString())))

        // check balance market
        // balanceMarketAfter = balanceMarket + marketProceeds
        assert.equal(web3.utils.fromWei(balanceMarketAfter), parseFloat(web3.utils.fromWei(balanceMarket)) + parseFloat(web3.utils.fromWei(marketProceeds.toString())))
    })

})
const { expect, assert } = require("chai");
const { web3 } = require("hardhat");
const deploy = require("../scripts/deploy");
const { hexToNumber } = require("web3-utils");

function increaseBlock() {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({ method: "evm_mine", params: [] }, (error, res) => {
            if (error) return reject(error)
            resolve(res)
        })
    })
}


describe("DemoleNFTSaleV4", () => {
    let accounts;
    let contracts;

    before(async function () {
        accounts = await web3.eth.getAccounts();
        contracts = await deploy();

        await contracts.nft.multipleMint(accounts[0], 20)
        await contracts.nft.setApprovalForAll(contracts.demoleNFTSaleV4.address, true, { from: accounts[0] })
        await contracts.token.mint(accounts[1], web3.utils.toWei("5000"))
        await contracts.token.mint(accounts[2], web3.utils.toWei("5000"))
        await contracts.token.mint(accounts[3], web3.utils.toWei("15000"))

        await contracts.demoleNFTSaleV4.setSaleInfo(true, 10, 2)
        await contracts.demoleNFTSaleV4.setSaleInfo(false, 5, 1)
    });

    it("cant register when register is closed", async () => {
        try {
            await contracts.demoleNFTSaleV4.setClose(true, true)
            await contracts.demoleNFTSaleV4.register(1)
        } catch (error) {
            assert.include(error.message, "register is closed")
            //reset setClose
            await contracts.demoleNFTSaleV4.setClose(false, false)
        }
    })

    it("min ticket register is 1", async () => {
        try {
            await contracts.demoleNFTSaleV4.register(0)
        } catch (error) {
            assert.include(error.message, "min ticket is 1")
        }
    })

    it("cant register when balance not enough", async () => {
        try {
            await contracts.demoleNFTSaleV4.register(1, { from: accounts[4] })
        } catch (error) {
            assert.include(error.message, "balance not enough")
        }
    })

    it("cant register when not approve", async () => {
        try {
            await contracts.demoleNFTSaleV4.register(1, { from: accounts[1] })
        } catch (error) {
            assert.include(error.message, "ERC20: transfer amount exceeds allowance")
        }
    })

    it("register success", async () => {
        await contracts.token.approve(contracts.demoleNFTSaleV4.address, web3.utils.toWei("2000"), { from: accounts[1] })

        const balanceMarketBefore = await contracts.token.balanceOf(contracts.demoleNFTSaleV4.address)
        const balanceBuyerBefore = await contracts.token.balanceOf(accounts[1])

        const tx = await contracts.demoleNFTSaleV4.register(1, { from: accounts[1] }) //await register(1, 1) // 
        const gas = tx.receipt.gasUsed * hexToNumber(tx.receipt.effectiveGasPrice)

        const balanceMarketAfer = await contracts.token.balanceOf(contracts.demoleNFTSaleV4.address)
        const balanceBuyerAfter = await contracts.token.balanceOf(accounts[1])

        // check user array in market
        const user = await contracts.demoleNFTSaleV4.users(accounts[1])
        assert.equal(user.amountTicket, 1)
        assert.isAbove(parseInt(user.lockedAt), 0)

        // check balance market
        // balanceMarketBefore = balanceMarketAfer - amountTokenRequire
        assert.equal(balanceMarketBefore, balanceMarketAfer - web3.utils.toWei("1000"))

        // check balance buyer
        // balanceBuyerAfter = balanceBuyerBefore - amountTokenRequire - gas
        assert.equal(balanceBuyerAfter, balanceBuyerBefore - web3.utils.toWei("1000") - web3.utils.fromWei(gas.toString()))
    })


    it("cant unlock when amount ticket is zero", async () => {
        try {
            await contracts.demoleNFTSaleV4.unlock({ from: accounts[2] })
        } catch (error) {
            assert.include(error.message, "amount ticket is zero")
        }
    })

    it("cant unlock when not enough time", async () => {
        try {
            await contracts.demoleNFTSaleV4.register(1, { from: accounts[1] })
            await contracts.demoleNFTSaleV4.unlock({ from: accounts[1] })
        } catch (error) {
            assert.include(error.message, "not time to unlock")
        }
    })

    it("unlock success", async () => {
        // register account 2
        await contracts.token.approve(contracts.demoleNFTSaleV4.address, web3.utils.toWei("5000"), { from: accounts[2] })
        await contracts.demoleNFTSaleV4.register(1, { from: accounts[2] })

        const balanceMarketBefore = await contracts.token.balanceOf(contracts.demoleNFTSaleV4.address)
        const balanceBuyerBefore = await contracts.token.balanceOf(accounts[2])
        const userBefore = await contracts.demoleNFTSaleV4.users(accounts[2])

        await contracts.demoleNFTSaleV4.setLockTime(1)
        const tx = await contracts.demoleNFTSaleV4.unlock({ from: accounts[2] })
        const gas = tx.receipt.gasUsed * hexToNumber(tx.receipt.effectiveGasPrice)

        const balanceMarketAfer = await contracts.token.balanceOf(contracts.demoleNFTSaleV4.address)
        const balanceBuyerAfter = await contracts.token.balanceOf(accounts[2])

        // check user array in market 
        const user = await contracts.demoleNFTSaleV4.users(accounts[2])
        assert.equal(user.amountTicket, 0)

        // check balance buyer
        // balanceBuyerBefore = balanceBuyerAfter - amountTicket * amountTokenPerTicket
        assert.equal(balanceBuyerBefore, balanceBuyerAfter - userBefore.amountTicket * web3.utils.toWei("1000"))

        // check balance market
        // balanceMarketAfer = balanceMarketBefore - amountTicket * amountTokenPerTicket - gas
        assert.equal(balanceMarketAfer, balanceMarketBefore - userBefore.amountTicket * web3.utils.toWei("1000") - web3.utils.fromWei(gas.toString()))

        // reset lockTime
        await contracts.demoleNFTSaleV4.setLockTime(14 * 24 * 60 * 60)
    })

    it("cant buy when close sale", async () => {
        try {
            await contracts.demoleNFTSaleV4.setClose(true, true)
            await contracts.demoleNFTSaleV4.buy(true)
        } catch (error) {
            assert.include(error.message, "not time to buy")
            //reset setClose
            await contracts.demoleNFTSaleV4.setClose(false, false)
        }
    })

    it("cant buy when not yet open sale", async () => {
        try {
            await contracts.demoleNFTSaleV4.setOpenSaleAt(parseInt(new Date().getTime() / 1000 * 2))
            await contracts.demoleNFTSaleV4.buy(true)
        } catch (error) {
            assert.include(error.message, "not time to buy")
            //reset setOpenSaleAt
            await contracts.demoleNFTSaleV4.setOpenSaleAt(0)
        }
    })

    it("cant buy when not enough ticket", async () => {
        try {
            await contracts.demoleNFTSaleV4.buy(true)
        } catch (error) {
            assert.include(error.message, "not enough ticket")
        }
    })

    it("cant buy when sold out", async () => {
        try {
            await contracts.demoleNFTSaleV4.buy(true, { from: accounts[1] })
        } catch (error) {
            assert.include(error.message, "sold out")
        }
    })

    it("cant buy when transfer token failed", async () => {
        // case not approve token
        try {
            await contracts.demoleNFTSaleV4.pushTokenIds(true, [5, 6, 7, 8, 9])
            await contracts.demoleNFTSaleV4.buy(true, { from: accounts[1] })
        } catch (error) {
            assert.include(error.message, "ERC20: transfer amount exceeds allowance")
        }
    })

    it("buy sucsset", async () => {
        //info
        const info = await contracts.demoleNFTSaleV4.saleInfo(true)

        // register account 3
        await contracts.token.approve(contracts.demoleNFTSaleV4.address, web3.utils.toWei("15000"), { from: accounts[3] })
        await contracts.demoleNFTSaleV4.register(3, { from: accounts[3] })

        const buyerNFTBefore = await contracts.nft.balanceOf(accounts[3])
        const buyerBefore = await contracts.token.balanceOf(accounts[3])
        const ownerNFTBefore = await contracts.nft.balanceOf(accounts[0])
        const balanceMarketBefore = await contracts.token.balanceOf(contracts.demoleNFTSaleV4.address)
        const userBefore = await contracts.demoleNFTSaleV4.users(accounts[3])
        const tokenIdsBefore = await contracts.demoleNFTSaleV4.viewTokenIds(true)

        const tx = await contracts.demoleNFTSaleV4.buy(true, { from: accounts[3] })
        const gas = tx.receipt.gasUsed * hexToNumber(tx.receipt.effectiveGasPrice)

        const buyerNFTAfter = await contracts.nft.balanceOf(accounts[3])
        const buyerAfter = await contracts.token.balanceOf(accounts[3])
        const ownerNFTAfter = await contracts.nft.balanceOf(accounts[0])
        const balanceMarketAfter = await contracts.token.balanceOf(contracts.demoleNFTSaleV4.address)
        const userAfter = await contracts.demoleNFTSaleV4.users(accounts[3])
        const tokenIdsAfter = await contracts.demoleNFTSaleV4.viewTokenIds(true)


        // check buyer
        assert.equal(buyerNFTBefore, buyerNFTAfter - 5)
        assert.equal(buyerBefore, buyerAfter - info.price - web3.utils.fromWei(gas.toString()))

        // check owner
        assert.equal(ownerNFTAfter, ownerNFTBefore - 5)

        // check market
        assert.equal(balanceMarketBefore, balanceMarketAfter - info.price)
        assert.equal(userAfter.amountTicket, userBefore.amountTicket - info.amountTicketRequire)
        assert.equal(tokenIdsAfter.length, tokenIdsBefore.length - 5)
    })
})
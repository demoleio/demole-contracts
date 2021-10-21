const { expect, assert } = require("chai");
const { web3 } = require("hardhat");
const { toBN } = require("web3-utils");
const deploy = require("../scripts/deploy")

function increaseBlock() {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({ method: "evm_mine", params: [] }, (error, res) => {
            if (error) return reject(error)
            resolve(res)
        })
    })
}

describe("Gorvernor", () => {
    let accounts;
    let contracts;

    before(async function () {
        accounts = await web3.eth.getAccounts();
        contracts = await deploy();
    });

    async function propose() {
        const targets = [contracts.token.address]
        const values = [0]
        const signatures = ["mint(address,uint256)"]
        const calldatas = [web3.eth.abi.encodeParameters(["address", "uint256"], [accounts[1], web3.utils.toWei("1000").toString()])]

        // approve token for propose
        await contracts.token.approve(contracts.gorvernor.address, web3.utils.toWei("5000000"))
        await contracts.gorvernor.propose(targets, values, signatures, calldatas, "mint token", 15)
    }

    it("propose", async () => {
        const beforeBalance = await contracts.token.balanceOf(accounts[0])
        await propose()
        const proposalThreshold = await contracts.gorvernor.proposalThreshold()
        const currentBalance = await contracts.token.balanceOf(accounts[0])
        assert.equal(beforeBalance.sub(proposalThreshold).toString(), currentBalance.toString())
    })

    it("can't execute when not reached endBlock", async () => {
        try {
            await contracts.gorvernor.execute(1)
        } catch(error) {
            assert.include(error.message, "proposal can only be execute if it is succeeded")
        }
    })

    it("can't vote when not enough token lock", async () => {
        await contracts.token.approve(contracts.gorvernor.address, web3.utils.toWei("1000"), {from: accounts[1]})

        try {
            await contracts.gorvernor.castVote(1, web3.utils.toWei("1000"), true, {from: accounts[1]})
        } catch(error) {
            assert.include(error.message, "amountVote not enough")
        }
    })

    it("vote success", async () => {
        await contracts.token.transfer(accounts[1], web3.utils.toWei("1000"))
        await contracts.token.approve(contracts.gorvernor.address, web3.utils.toWei("1000"), {from: accounts[1]})
        await contracts.gorvernor.castVote(1, web3.utils.toWei("1000"), true, {from: accounts[1]})

        assert.equal((await contracts.gorvernor.proposals(1)).forVotes, web3.utils.toWei("1000"))
    })

    it("can't vote 2 times", async () => {
        await contracts.token.transfer(accounts[1], web3.utils.toWei("1000"))
        await contracts.token.approve(contracts.gorvernor.address, web3.utils.toWei("1000"), {from: accounts[1]})

        try {
            await contracts.gorvernor.castVote(1, web3.utils.toWei("1000"), true, {from: accounts[1]})
        } catch (error) {
            assert.include(error.message, "voter already voted")
        }

        // return token test -> account 0
        contracts.token.transfer(accounts[0], web3.utils.toWei("1000"), {from: accounts[1]})
    })

    it("can't unlock token when proposal not reached endBlock", async () => {
        try {
            await contracts.gorvernor.unlockToken(1, {from: accounts[1]})
        } catch (error) {
            assert.include(error.message, "proposal is not ended")
        }
    })

    it("can't execute when amount vote not reached quorumVotes", async () => {
        // increase 10 block
        const promiseArr = [];
        for(let i = 0; i < 10; i++) {
            promiseArr.push(increaseBlock())
        }

        await Promise.all(promiseArr)

        try {
            const tx = await contracts.gorvernor.execute(1)
        } catch (error) {
            assert.include(error.message, "proposal can only be execute if it is succeeded")
        }
    })

    it("unlock token when proposal defeated", async () => {
        await contracts.gorvernor.unlockToken(1, {from: accounts[1]})
        assert.equal(await contracts.token.balanceOf(accounts[1]), web3.utils.toWei("1000"))
    })

    it("can't unlock 2 times", async () => {
        try {
            await contracts.gorvernor.unlockToken(1, {from: accounts[1]})
        } catch (error) {
            assert.include(error.message, "token locked is zero")
        }
    })

    it("proposer unlock token", async () => {
        const beforeBalance = await contracts.token.balanceOf(accounts[0])
        await contracts.gorvernor.unlockToken(1)
        const currentBalance = await contracts.token.balanceOf(accounts[0])
        const proposalThreshold = await contracts.gorvernor.proposalThreshold()
        // currentBalance = beforeBalance - unlocked proposalThreshold (500000)
        assert.equal(currentBalance.toString(), beforeBalance.add(proposalThreshold).toString())
    })

    it("can't proposer unlock token 2 times", async () => {
        try {
            await contracts.gorvernor.unlockToken(1)
        } catch (error) {
            assert.include(error.message, "token locked is zero")
        }
    })

    it("execute success", async () => {
        await propose()

        await contracts.token.transfer(accounts[1], web3.utils.toWei("40000000"))
        await contracts.token.approve(contracts.gorvernor.address, web3.utils.toWei("40000000"), {from: accounts[1]})
        await contracts.gorvernor.castVote(2, web3.utils.toWei("40000000"), true, {from: accounts[1]})

        // increase 15 block
        const promiseArr = [];
        for(let i = 0; i < 15; i++) {
            promiseArr.push(increaseBlock())
        }

        await contracts.gorvernor.execute(2)

        // 1000 (current balance) + 1000 (mint by executed)
        assert.equal(await contracts.token.balanceOf(accounts[1]), web3.utils.toWei("2000"))
    })

    it("can't excute more when proposal executed", async () => {
        try {
            await contracts.gorvernor.execute(2)
        } catch (error) {
            assert.include(error.message, "proposal can only be execute if it is succeeded")
        }
    })

    it("proposer unlock token when proposal executed", async () => {
        const beforeBalance = await contracts.token.balanceOf(accounts[0])
        await contracts.gorvernor.unlockToken(2)
        const proposalThreshold = await contracts.gorvernor.proposalThreshold()
        const currentBalance = await contracts.token.balanceOf(accounts[0])
        
        // currentBalance = beforeBalance + unlocked proposalThreshold (500000)
        assert.equal(currentBalance.toString(), beforeBalance.add(proposalThreshold).toString())
    })

    it("voter unlock token when proposal executed", async () => {
        await contracts.gorvernor.unlockToken(2, {from: accounts[1]})
        // 2000 (current balance) + 40000000 (token locked)
        assert.equal(await contracts.token.balanceOf(accounts[1]), web3.utils.toWei("40002000"))
    })

    it("can't cancel when proposal executed", async () => {
        try {
            await contracts.gorvernor.cancel(2)
        } catch (error) {
            assert.include(error.message, "cannot cancel executed proposal")
        }
    })

    it("cancel success", async () => {
        const beforeBalance = await contracts.token.balanceOf(accounts[0])
        await propose()
        await contracts.gorvernor.cancel(3)
        const currentBalance = await contracts.token.balanceOf(accounts[0])

        // currentBalance = beforeBalance
        assert.equal(beforeBalance.toString(), currentBalance.toString())
    })

    it("unlock token before cancel", async () => {
        let beforeBalance = await contracts.token.balanceOf(accounts[0])
        await propose()
        
        // increase 15 block
        const promiseArr = [];
        for(let i = 0; i < 15; i++) {
            promiseArr.push(increaseBlock())
        }
        
        await contracts.gorvernor.unlockToken(4)
        let currentBalance = await contracts.token.balanceOf(accounts[0])

        // currentBalance = beforeBalance
        assert.equal(currentBalance.toString(), beforeBalance.toString())

        // update balance
        beforeBalance = currentBalance
        await contracts.gorvernor.cancel(4)
        currentBalance = await contracts.token.balanceOf(accounts[0])

        // currentBalance = beforeBalance
        assert.equal(beforeBalance.toString(), currentBalance.toString())
    })

    it("can't execute when proposal is cancelled", async () => {
        try {
            await contracts.gorvernor.execute(4)
        } catch (error) {
            assert.include(error.message, "proposal can only be execute if it is succeeded")
        }
    })
})
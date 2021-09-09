const { expect, assert } = require("chai");
const { web3 } = require("hardhat");
const { default: MerkleTree } = require("merkletreejs");
const deploy = require("../scripts/deploy");
const { numberToHex, padLeft, stripHexPrefix, stringToHex } = require("web3-utils");
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

function encodeABIPacked(address, amount) {
    return  address.toLowerCase() + padLeft(stripHexPrefix(numberToHex(amount)), 64)
}

describe("Token Sale", () => {
    let accounts;
    let contracts;
    let tree;

    before(async function () {
        accounts = await web3.eth.getAccounts();
        contracts = await deploy();

        let saleData = [ // address + amount bought
            encodeABIPacked(accounts[1], web3.utils.toWei("100")),
            encodeABIPacked(accounts[2], web3.utils.toWei("200")),
            encodeABIPacked(accounts[3], web3.utils.toWei("300")),
            encodeABIPacked(accounts[4], web3.utils.toWei("400")),
            encodeABIPacked(accounts[5], web3.utils.toWei("500"))
        ]

        const leaves = saleData.map(x => keccak256(x))
        tree = new MerkleTree(leaves, keccak256, {sort: true})
    });

    it("create new allocations", async () => {
        const root = tree.getHexRoot()
        const totalAmountSale = web3.utils.toWei("600")

        await contracts.token.approve(contracts.tokenSale.address, totalAmountSale)
        await contracts.tokenSale.seedNewAllocations(root, totalAmountSale);

        const result = await contracts.tokenSale.merkleRoots(0)

        assert.equal(result, root)
        assert.equal(await contracts.token.balanceOf(contracts.tokenSale.address), totalAmountSale)
    })

    it("claim success", async () => {
        const addressClaim = accounts[1]
        const amountClaim = web3.utils.toWei("100")
        const trancheId = 0

        const leaf = keccak256(encodeABIPacked(addressClaim, amountClaim))
        const proof = tree.getHexProof(leaf)

        await contracts.tokenSale.claimWeek(addressClaim, trancheId, amountClaim, proof)

        assert.equal(await contracts.token.balanceOf(accounts[1]), amountClaim)
        assert.equal(await contracts.token.balanceOf(contracts.tokenSale.address), web3.utils.toWei("500"))
    })

    it("can't claim 2 times", async() => {
        const addressClaim = accounts[1]
        const amountClaim = web3.utils.toWei("100")
        const trancheId = 0

        const leaf = keccak256(encodeABIPacked(addressClaim, amountClaim))
        const proof = tree.getHexProof(leaf)

        try {
            const tx = await contracts.tokenSale.claimWeek(addressClaim, trancheId, amountClaim, proof)
            assert.isEmpty(tx)
        } catch (error) {
            assert.include(error.message, "revert LP has already claimed")
        }
    })

    it("can't claim when wrong amount", async() => {
        const addressClaim = accounts[2]
        const amountClaim = web3.utils.toWei("300")
        const trancheId = 0

        const leaf = keccak256(encodeABIPacked(addressClaim, amountClaim))
        const proof = tree.getHexProof(leaf)

        try {
            const tx = await contracts.tokenSale.claimWeek(addressClaim, trancheId, amountClaim, proof)
            assert.isEmpty(tx)
        } catch (error) {
            assert.include(error.message, "Incorrect merkle proof")
        }
    })

    it("can't claim when wrong proof", async() => {

        const addressClaim = accounts[6]
        const amountClaim = web3.utils.toWei("600")

        let saleData = [ // address + amount bought
            encodeABIPacked(accounts[6], web3.utils.toWei("600")),
            encodeABIPacked(accounts[7], web3.utils.toWei("700")),
            encodeABIPacked(accounts[8], web3.utils.toWei("800"))
        ]

        const leaves = saleData.map(x => keccak256(x))
        const badTree = new MerkleTree(leaves, keccak256, {sort: true})
        const trancheId = 0

        const leaf = keccak256(encodeABIPacked(addressClaim, amountClaim))
        const proof = badTree.getHexProof(leaf)

        try {
            const tx = await contracts.tokenSale.claimWeek(addressClaim, trancheId, amountClaim, proof)
            assert.isEmpty(tx)
        } catch (error) {
            assert.include(error.message, "Incorrect merkle proof")
        }
    })

    it("test 10k user", async () => {
        let saleData = []
        let users = []
        for(let i = 0; i < 10000; i++) {
            const address = web3.eth.accounts.create().address
            users.push(address)
            saleData.push(encodeABIPacked(address, web3.utils.toWei("100")))
        }
        
        const leaves = saleData.map(x => keccak256(x))
        const tree = new MerkleTree(leaves, keccak256, {sort: true})

        const root = tree.getHexRoot()
        const totalAmountSale = web3.utils.toWei("1000000")

        await contracts.token.approve(contracts.tokenSale.address, totalAmountSale)
        await contracts.tokenSale.seedNewAllocations(root, totalAmountSale);

        const result = await contracts.tokenSale.merkleRoots(1)

        assert.equal(result, root)
        // 500 (current balance) + 1000000
        assert.equal(await contracts.token.balanceOf(contracts.tokenSale.address), web3.utils.toWei("1000500"))

        // claim
        const addressClaim = users[0]
        const amountClaim = web3.utils.toWei("100")
        const trancheId = 1

        const leaf = keccak256(encodeABIPacked(addressClaim, amountClaim))
        const proof = tree.getHexProof(leaf)

        await contracts.tokenSale.claimWeek(addressClaim, trancheId, amountClaim, proof)

        assert.equal(await contracts.token.balanceOf(addressClaim), amountClaim)
    }).timeout(30000)
})
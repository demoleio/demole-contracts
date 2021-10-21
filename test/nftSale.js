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

function encodeABIPacked(address, amount) {
    return  address.toLowerCase() + padLeft(stripHexPrefix(numberToHex(amount)), 64)
}

describe("NFT Sale V1", () => {
    let accounts;
    let contracts;
    let tree;

    before(async function () {
        accounts = await web3.eth.getAccounts();
        contracts = await deploy();
    });

    it("mint 50 nft", async () => {
        await contracts.nft.multipleMint(accounts[0], 50)

        assert.equal(await contracts.nft.totalSupply(), "50")
    })

    it("start round 1", async () => {
        let saleData = [ // address + tokenId
            encodeABIPacked(accounts[1], 2),
            encodeABIPacked(accounts[2], 5),
            encodeABIPacked(accounts[3], 6),
            encodeABIPacked(accounts[4], 3),
            encodeABIPacked(accounts[5], 12)
        ]

        const leaves = saleData.map(x => keccak256(x))
        tree = new MerkleTree(leaves, keccak256, {sort: true})
        const root = tree.getHexRoot()

        // approve contract sale can transfer ERC721 token
        await contracts.nft.setApprovalForAll(contracts.nftSale.address, true);
        // start sale
        await contracts.nftSale.startSale(1, root)

        assert.equal(await contracts.nftSale.merkleRoots(1), root)
    })

    it("can't buy when not enough balance", async () => {
        await web3.eth.sendTransaction({to:accounts[6], from:accounts[1], value: web3.utils.toWei("9999.8", "ether")})
        assert.equal(await web3.eth.getBalance(accounts[1]), "195015832000000000"); // ~ 0.195 ether

        const round = 1
        const addressBuy = accounts[1]
        const tokenId = 2

        const leaf = keccak256(encodeABIPacked(addressBuy, tokenId))
        const proof = tree.getHexProof(leaf)

        try {
            const tx = await contracts.nftSale.buy(addressBuy, round, tokenId, proof)
            assert.isEmpty(tx)
        } catch(error) {
            assert.include(error.message, "msg.value not enough")
        }
    })

    it("can't buy when round is not open", async () => {
        const round = 2
        const addressBuy = accounts[2]
        const tokenId = 5

        const leaf = keccak256(encodeABIPacked(addressBuy, tokenId))
        const proof = tree.getHexProof(leaf)

        try {
            const tx = await contracts.nftSale.buy(addressBuy, round, tokenId, proof, {value: web3.utils.toWei("1", "ether")})
            assert.isEmpty(tx)
        } catch(error) {
            assert.include(error.message, "buy: round is not open")
        }
    })

    it("buy success", async () => {
        const round = 1
        const addressBuy = accounts[2]
        const tokenId = 5

        const leaf = keccak256(encodeABIPacked(addressBuy, tokenId))
        const proof = tree.getHexProof(leaf)

        await contracts.nftSale.buy(addressBuy, round, tokenId, proof, {value: web3.utils.toWei("1", "ether")})

        assert.equal(await contracts.nft.ownerOf(tokenId), addressBuy)
        assert.equal(await web3.eth.getBalance(contracts.nftSale.address), web3.utils.toWei("1", "ether"))
    })

    it("withdraw success", async () => {
        const beforeBalance = toBN(await web3.eth.getBalance(accounts[0]))
        // currrent balance: 9998.85389

        const tx = await contracts.nftSale.withdraw()
        const currentBalance = toBN(await web3.eth.getBalance(accounts[0]))
        const gasPrice = toBN("8000000000"); // 8000000000 wei
        const gasFee = gasPrice.mul(toBN(tx.receipt.gasUsed))
        assert.equal(await web3.eth.getBalance(contracts.nftSale.address), "0")
        // currentBalance = beforeBalance + 1 ether - gasFee
        assert.equal(currentBalance.toString(), beforeBalance.add(toBN(toWei("1", "ether"))).sub(gasFee).toString())
    })

})
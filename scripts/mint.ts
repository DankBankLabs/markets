import { BigNumber, constants, Contract } from "ethers";
import { ethers } from "hardhat";
import { TASK_COMPILE_SOLIDITY_COMPILE } from "hardhat/builtin-tasks/task-names";
import NFT_VAULT_ABI from "../abi/ERC721VaultFactory.json";
import DANK_MARKET_ABI from "../abi/DankMarket.json";
import ERC20_ABI from "../abi/Erc20.json";
import { MARKET_CONTRACT_ADDRESS, NFT_VAULT_CONTRACT_ADDRESS } from "../src/constants";
import { ONE } from "../test/helpers";
import { calculateBuyTokensOut, calculateSellEthOut } from "../src";

const NFT_NAME = "Nft Test";
const NFT_SYMBOL = "TNT";
const SUPPLY = "1000000000000000000000";
const LIST_PRICE = "100000000000000000";
const FEE = "10";

async function buyTokens(fractionalizedToken: Contract, market: Contract) {
    const tokenPool = await fractionalizedToken.balanceOf(market.address);
    const ethPool = await market.getTotalEthPoolSupply(fractionalizedToken.address);
    const expectedTokensOut = calculateBuyTokensOut(ONE, ethPool, tokenPool);
    const option = { value: ONE };
    return market.buy(fractionalizedToken.address, expectedTokensOut, option);
}

async function sellTokens(tokensIn: BigNumber, fractionalizedToken: Contract, market: Contract) {
    const tokenPool = await fractionalizedToken.balanceOf(market.address);
    const prevEthPool = await market.getTotalEthPoolSupply(fractionalizedToken.address);
    const expectedEthOut = calculateSellEthOut(tokensIn, tokenPool, prevEthPool);
    await market.sell(fractionalizedToken.address, tokensIn, expectedEthOut);
}

async function main() {
    const [signer] = await ethers.getSigners();

    const Erc721Mock = await ethers.getContractFactory("ERC721Mock");
    const erc721Mock = await Erc721Mock.deploy(NFT_NAME, NFT_SYMBOL);

    const tokenAddress = erc721Mock.address;
    console.debug("Erc721 deployed to:", tokenAddress);
    const fractional = new Contract(NFT_VAULT_CONTRACT_ADDRESS, NFT_VAULT_ABI, signer);

    const tokenId = BigNumber.from(Math.floor(Math.random() * 10));

    const mintTx = await erc721Mock.mint(signer.address, tokenId);
    await mintTx.wait();
    const approvalTx = await erc721Mock.setApprovalForAll(fractional.address, true);
    await approvalTx.wait();
    console.debug("Done minting ERC721 NFT: ", NFT_SYMBOL);

    const response = await fractional.mint(NFT_NAME, NFT_SYMBOL, tokenAddress, tokenId, SUPPLY, LIST_PRICE, FEE);
    const receipt = await response.wait();
    console.debug("Done fractionalizing NFT");

    const mintEvent = receipt.events.find((event: any) => "event" in event && event?.event === "Mint");
    const newVaultAddress = mintEvent.args?.[3];
    console.debug("New fractionalized token address:", newVaultAddress);

    const market = await new Contract(MARKET_CONTRACT_ADDRESS, DANK_MARKET_ABI, signer);
    const fractionalizedToken = new Contract(newVaultAddress, ERC20_ABI, signer);

    const approveToMarketTx = await fractionalizedToken.approve(market.address, constants.MaxUint256);
    await approveToMarketTx.wait();
    console.debug("Approved transfer for market contract");

    const initTx = await market.initPool(fractionalizedToken.address, BigNumber.from(10), BigNumber.from(10));
    await initTx.wait();
    console.debug("Initialized market pool");

    const buyTx = await buyTokens(fractionalizedToken, market);
    await buyTx.wait();
    console.debug(`Bought one ${NFT_SYMBOL} token`);

    await sellTokens(ONE, fractionalizedToken, market);
    console.debug(`Sold one ${NFT_SYMBOL} token`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

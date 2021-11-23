import hre from "hardhat";
import { BigNumber, constants, Contract } from "ethers";
import { ethers } from "hardhat";
import { TASK_COMPILE_SOLIDITY_COMPILE } from "hardhat/builtin-tasks/task-names";
import { ONE } from "../test/helpers";
import { calculateBuyTokensOut, calculateSellEthOut } from "../src";

/*
const localVault = "0x0F68A202C3C9d9e63e49F14D6c52FCad8A98c194";
const localMarket = "0xDa35f8ee30Edaac97A1B410e698a1bc5D2e8DB94";

const mainnetVault = "0x85Aa7f78BdB2DE8F3e0c0010d99AD5853fFcfC63"; 
const mainnetMarket = "0x0988Fb1C153a6f6492218Ead6b17fd795d6D18F9";
*/

const goerliVault = "0x872B1cfd9F3D97AEbC75C127F1C254623c2bD741";
const goerliMarket = "0xe0424eCb102610348DD3e1F1bB59748E7e288196";

export const VAULT_FACTORY_ADDRESS = goerliVault;
export const MARKET_CONTRACT_ADDRESS = goerliMarket;

const NFT_NAME = "Nft Test";
const NFT_SYMBOL = "TNT";
const SUPPLY = ONE.mul(1000000); // 1,000,000 tokens
const LIST_PRICE = BigNumber.from(10).pow(15); // list for 0.001 ETH
const FEE = "10"; // 1% fee

const VAULT_FACTORY_ABI = hre.artifacts.readArtifactSync("ERC721VaultFactory").abi;
const DANK_MARKET_ABI = hre.artifacts.readArtifactSync("DankMarket").abi;
const ERC20_ABI = hre.artifacts.readArtifactSync("Erc20").abi;

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

const getGasPrice = async () => {
    const gasPrice = await ethers.provider.getGasPrice();

    return gasPrice.mul(2);
};

async function main() {
    const [signer] = await ethers.getSigners();

    const Erc721Mock = await ethers.getContractFactory("ERC721Mock");
    const erc721Mock = await Erc721Mock.deploy(NFT_NAME, NFT_SYMBOL);

    const tokenAddress = erc721Mock.address;
    console.debug("Erc721 deployed to:", tokenAddress);
    const fractional = new Contract(VAULT_FACTORY_ADDRESS, VAULT_FACTORY_ABI, signer);

    const tokenId = BigNumber.from(2);

    const mintTx = await erc721Mock.mint(signer.address, tokenId);
    await mintTx.wait();
    const approvalTx = await erc721Mock.setApprovalForAll(fractional.address, true);
    await approvalTx.wait();
    console.debug("Done minting ERC721 NFT: ", NFT_SYMBOL);

    const response = await fractional.mint(NFT_NAME, NFT_SYMBOL, tokenAddress, tokenId, SUPPLY, LIST_PRICE, FEE, {
        gasPrice: await getGasPrice(),
    });
    const receipt = await response.wait();
    console.debug("Done fractionalizing NFT");

    console.log({ receipt });

    const mintEvent = receipt.events.find((event: any) => "event" in event && event?.event === "Mint");
    const newVaultAddress = mintEvent.args?.[3];
    console.debug("New fractionalized token address:", newVaultAddress);

    const market = new Contract(MARKET_CONTRACT_ADDRESS, DANK_MARKET_ABI, signer);
    const fractionalizedToken = new Contract(newVaultAddress, ERC20_ABI, signer);

    const approveToMarketTx = await fractionalizedToken.approve(market.address, constants.MaxUint256, {
        gasPrice: await getGasPrice(),
    });
    await approveToMarketTx.wait();
    console.debug("Approved transfer for market contract");

    const initEthSupply = LIST_PRICE.mul(SUPPLY).div(ONE);

    const initTx = await market.initPool(fractionalizedToken.address, SUPPLY, initEthSupply, {
        gasPrice: await getGasPrice(),
    });
    await initTx.wait();
    console.debug("Initialized market pool");

    const buyTx = await buyTokens(fractionalizedToken, market);
    await buyTx.wait();
    console.debug(`Bought one ${NFT_SYMBOL} token`);

    await sellTokens(ONE.div(10), fractionalizedToken, market);
    console.debug(`Sold 0.1 ${NFT_SYMBOL} token`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

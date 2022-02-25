import { task } from "hardhat/config";
import { networks } from "../src/constants";

import { TASK_MINT_TOKEN_VAULT } from "./task-names";

task(TASK_MINT_TOKEN_VAULT, "Fractionalizes a mock NFT", async (taskArgs: any, hre: any) => {
    const SUPPLY = hre.ethers.BigNumber.from(10).pow(18).mul(1000000); // 1,000,000 tokens
    const LIST_PRICE = hre.ethers.BigNumber.from(10).pow(15); // list for 0.001 ETH
    const FEE = "10"; // 1%
    console.log("Starting: Fractionalizing NFT");
    const [deployer] = await hre.ethers.getSigners();
    const { nftName, nftSymbol } = taskArgs;
    const Erc721Mock = await hre.ethers.getContractFactory("ERC721Mock");
    const erc721Mock = await Erc721Mock.deploy(nftName, nftSymbol);
    const fractionalVaultFactoryAddress = networks[hre.network.name].vaultFactoryAddress;

    const vaultFactoryAbi = hre.artifacts.readArtifactSync("ERC721VaultFactory").abi;
    const tokenAddress = erc721Mock.address;

    const fractional = new hre.ethers.Contract(fractionalVaultFactoryAddress, vaultFactoryAbi, deployer);

    const tokenId = hre.ethers.BigNumber.from(Math.floor(Math.random() * 100));

    const mintTx = await erc721Mock.mint(deployer.address, tokenId);
    await mintTx.wait();

    const approvalTx = await erc721Mock.setApprovalForAll(fractional.address, true);
    await approvalTx.wait();

    const response = await fractional.mint(nftName, nftSymbol, tokenAddress, tokenId, SUPPLY, LIST_PRICE, FEE, {
        gasPrice: (await hre.ethers.provider.getGasPrice()).mul(2),
    });
    console.log("Done: Minting and fractionalizing ERC721 NFT %s found at address: %s", nftSymbol, erc721Mock.address);
    const mintReceipt = await response.wait();
    const vaultAddress = getVaultAddressFromMintReceipt(mintReceipt);
    console.log("Fractionalized Meme Token address: %s", vaultAddress);
})
    .addParam("nftName", "The name of the NFT")
    .addParam("nftSymbol", "The token symbol of the NFT");

function getVaultAddressFromMintReceipt(receipt: any) {
    const mintEvent = receipt.events.find((event: any) => "event" in event && event?.event === "Mint");
    return mintEvent.args?.[3];
}

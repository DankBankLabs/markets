import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";
import NFT_VAULT from "../abi/ERC721VaultFactory.json";
import { NFT_VAULT_CONTRACT_ADDRESS } from "../src/constants";

const NFT_NAME = "Nft Test";
const NFT_SYMBOL = "TNT";
const SUPPLY = "1000000000000000000000";
const LIST_PRICE = "100000000000000000";
const FEE = "10";

async function main() {
    const [signer] = await ethers.getSigners();

    const Erc721Mock = await ethers.getContractFactory("ERC721Mock");
    const erc721Mock = await Erc721Mock.deploy(NFT_NAME, NFT_SYMBOL);

    const tokenAddress = erc721Mock.address;
    console.debug("Erc721 deployed to:", tokenAddress);
    const fractional = new Contract(NFT_VAULT_CONTRACT_ADDRESS, NFT_VAULT, signer);

    const tokenId = BigNumber.from(Math.floor(Math.random() * 10));

    const mintTx = await erc721Mock.mint(signer.address, tokenId);
    await mintTx.wait();
    const approvalTx = await erc721Mock.setApprovalForAll(fractional.address, true);
    await approvalTx.wait();

    const response = await fractional.mint(NFT_NAME, NFT_SYMBOL, tokenAddress, tokenId, SUPPLY, LIST_PRICE, FEE);
    const receipt = await response.wait();
    console.debug({ receipt });
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

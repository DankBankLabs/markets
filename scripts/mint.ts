import { Contract } from "ethers";
import { ethers } from "hardhat";
import NFT_VAULT from "../abi/ERC721VaultFactory.json";
import { NFT_VAULT_CONTRACT_ADDRESS } from "../src/constants";
import { v4 as uuidv4 } from "uuid";

const NFT_NAME = "Nft Test";
const NFT_SYMBOL = "TNT";
const SUPPLY = "1000000000000000000000";
const LIST_PRICE = "10000000000000000000";
const FEE = "10";

async function main() {
    const [signer] = await ethers.getSigners();

    const ERC721Mock = await ethers.getContractFactory("ERC721Mock");
    const erc721Mock = await ERC721Mock.deploy();
    const fractional = new Contract(NFT_VAULT_CONTRACT_ADDRESS, NFT_VAULT, signer);

    const tokenId = uuidv4().toString();
    await erc721Mock.mint(signer.address, tokenId);

    const tokenAddress = erc721Mock.address;

    await erc721Mock.setApprovalForAll(fractional.address, true);
    await fractional.mint(NFT_NAME, NFT_SYMBOL, tokenAddress, tokenId, SUPPLY, LIST_PRICE, FEE);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

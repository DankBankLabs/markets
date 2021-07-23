import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";
import NFT_VAULT from "../abi/ERC721VaultFactory.json";
import { NFT_VAULT_CONTRACT_ADDRESS } from "../src/constants";
import { ERC721Mock } from "../typechain";
import { deploy } from "../test/helpers";

const NFT_NAME = "Nft Test";
const NFT_SYMBOL = "TNT";
const SUPPLY = "1000000000000000000000";
const LIST_PRICE = "100000000000000000";
const FEE = "10";

async function main() {
    const [signer] = await ethers.getSigners();

    const erc721Mock = await deploy<ERC721Mock>("ERC721Mock", { args: ["Mock NFT", "MNT"], connect: signer });
    const fractional = new Contract(NFT_VAULT_CONTRACT_ADDRESS, NFT_VAULT, signer);

    const tokenId = BigNumber.from(Math.floor(Math.random() * 100));
    await erc721Mock.mint(signer.address, tokenId);

    const tokenAddress = erc721Mock.address;

    await erc721Mock.setApprovalForAll(fractional.address, true);
    const response = await fractional.mint(NFT_NAME, NFT_SYMBOL, tokenAddress, tokenId, SUPPLY, LIST_PRICE, FEE);

    // const receipt = await response.wait();
    // console.debug(receipt);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

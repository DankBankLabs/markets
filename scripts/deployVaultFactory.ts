import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const settings = await ethers.getContractFactory("Settings");
    const settingsContract = await settings.deploy();

    console.log("Settings Address:", settingsContract.address);

    const erc721VaultFactory = await ethers.getContractFactory("ERC721VaultFactory");
    const erc721VaultFactoryContract = await erc721VaultFactory.deploy(settingsContract.address);

    console.log("ERC721VaultFactory Address:", erc721VaultFactoryContract.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

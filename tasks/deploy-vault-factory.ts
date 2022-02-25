import { task } from "hardhat/config";

import { TASK_DEPLOY_VAULT_FACTORY } from "./task-names";

task(TASK_DEPLOY_VAULT_FACTORY, "Prints the list of accounts", async (_taskArgs, hre) => {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Account balance:", (await deployer.getBalance()).toString());
    console.log("Network name: %s", hre.network.name);

    const settings = await hre.ethers.getContractFactory("Settings");
    const settingsContract = await settings.deploy();

    console.log("Settings Address:", settingsContract.address);

    const erc721VaultFactory = await hre.ethers.getContractFactory("ERC721VaultFactory");
    const erc721VaultFactoryContract = await erc721VaultFactory.deploy(settingsContract.address);

    console.log("ERC721VaultFactory Address:", erc721VaultFactoryContract.address);
});

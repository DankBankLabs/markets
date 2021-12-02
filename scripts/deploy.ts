import { ethers, upgrades } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    console.log("Account balance:", (await deployer.getBalance()).toString());

    const marketFactory = await ethers.getContractFactory("DankBankMarket");

    const market = await upgrades.deployProxy(marketFactory, ["DankBankMarket does not give a fuck about a uri"], {
        initializer: "init",
    });

    console.log({ market });
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

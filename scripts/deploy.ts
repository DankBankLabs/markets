import { ethers, upgrades } from "hardhat";

async function main() {
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

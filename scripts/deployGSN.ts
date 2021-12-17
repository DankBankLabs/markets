import { ethers, upgrades } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    console.log("Account balance:", (await deployer.getBalance()).toString());

    const ForwarderFactory = await ethers.getContractFactory("MinimalForwarder");
    const MarketGSNFactory = await ethers.getContractFactory("DankBankMarketGSN");

    const forwarder = await ForwarderFactory.deploy();
    console.log(`Forwarder Address: ${forwarder.address}`);

    const gsnMarket = await upgrades.deployProxy(MarketGSNFactory, ["un-used uri", forwarder.address], {
        initializer: "init",
    });

    console.log({ gsnMarket });
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

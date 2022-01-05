import { ethers, upgrades } from "hardhat";
import { CHAIN_ID_TO_NAME, USDC_CONTRACT_ADDRESS } from "../src/constants";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    console.log("Account balance:", (await deployer.getBalance()).toString());

    const ForwarderFactory = await ethers.getContractFactory("MinimalForwarder");
    const MarketGSNFactory = await ethers.getContractFactory("DankBankMarketGSN");

    const forwarder = await ForwarderFactory.deploy();
    console.log(`MinimalForwarder Address: ${forwarder.address}`);

    const chainId = await deployer.getChainId();
    const usdcContractAddress = USDC_CONTRACT_ADDRESS[CHAIN_ID_TO_NAME[chainId]];

    if (!usdcContractAddress) {
        console.log("No USDC contract address for chainId:", chainId);
        return;
    }

    const gsnMarket = await upgrades.deployProxy(
        MarketGSNFactory,
        ["un-used uri", forwarder.address, usdcContractAddress],
        {
            initializer: "init",
        },
    );

    console.log(`GSN Market Address: ${gsnMarket.address}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

import { ethers, defender, network } from "hardhat";
import fs from "fs";
import path from "path";

const OZ_MANIFEST_FOLDER_NAME = {
    matic: "unknown-137",
    mainnet: "mainnet",
    goerli: "goerli",
    mumbai: "unknown-80001",
};

const getMarketAddress = (networkName: string): string => {
    const deploymentPath = path.resolve(__dirname, "../.openzeppelin", `${OZ_MANIFEST_FOLDER_NAME[networkName]}.json`);

    const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));

    return deployments.proxies[0].address;
};

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    console.log("Account balance:", (await deployer.getBalance()).toString());

    console.log("Deploying to network: ", network.name);

    const marketAddress = getMarketAddress(network.name);

    const marketFactory = await ethers.getContractFactory("DankBankMarket");

    const proposal = await defender.proposeUpgrade(marketAddress, marketFactory);

    console.log({ proposal });
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

import { ethers, defender, network, upgrades } from "hardhat";
import fs from "fs";
import path from "path";

const getMarketAddress = (networkName: string): string => {
    const deploymentPath = path.resolve(__dirname, "../.openzeppelin", `${networkName}.json`);

    const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));

    return deployments.proxies[0].address;
};

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    console.log("Account balance:", (await deployer.getBalance()).toString());

    const marketAddress = getMarketAddress(network.name);

    const marketFactory = await ethers.getContractFactory("DankBankMarketGSN");

    const proposal = await defender.proposeUpgrade(marketAddress, marketFactory);

    console.log({ proposal });
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

import { ethers, defender, network } from "hardhat";
import fs from "fs";
import path from "path";

const getMarketAddress = (networkName: string): string => {
    const deploymentPath = path.resolve(__dirname, "../.openzeppelin", `${networkName}.json`);

    const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));

    return deployments.proxies[0].address;
};

async function main() {
    const marketAddress = getMarketAddress(network.name);

    const marketFactory = await ethers.getContractFactory("DankBankMarket");

    const proposal = await defender.proposeUpgrade(marketAddress, marketFactory);

    console.log({ url: proposal.url });
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

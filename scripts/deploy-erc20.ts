import { ethers, deployments } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    console.log("Account balance:", (await deployer.getBalance()).toString());

    const token = await deployments.deploy("MockToken", { from: deployer.address, log: true });

    console.log(`The mock token address is ${token.address.toLowerCase()} with total supply`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

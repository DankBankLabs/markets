import { ethers, upgrades } from "hardhat";

async function main() {
    const greeterFactory = await ethers.getContractFactory("Greeter");

    const greeter = await upgrades.deployProxy(greeterFactory, ["Wassup"], { initializer: "init" });

    console.log({ greeter });
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

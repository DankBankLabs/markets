import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;

    const { deployer } = await getNamedAccounts();

    const deployment = await deployments.deploy("Settings", {
        from: deployer,
        args: [],
        log: true,
    });

    console.log("deploy factory");

    await deployments.deploy("ERC721VaultFactory", {
        from: deployer,
        args: [deployment.address],
        log: true,
    })
};

export default func;

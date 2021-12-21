import { MockContract } from "ethereum-waffle";
import { Contract, Signer } from "ethers";
import { ethers, waffle, artifacts, upgrades } from "hardhat";
import { Artifact } from "hardhat/types";

export async function deploy<T extends Contract>(
    deploymentName: string,
    { from, args, connect }: { from?: Signer; args: Array<unknown>; connect?: Signer },
    contractName: string = deploymentName,
): Promise<T> {
    // Unless overridden, deploy from named address "deployer"
    if (from === undefined) {
        // eslint-disable-next-line no-param-reassign
        from = (await ethers.getSigners())[0];
    }

    const artifact: Artifact = await artifacts.readArtifact(deploymentName);

    const instance = <T>await waffle.deployContract(from, artifact, args);

    return (connect ? instance.connect(connect) : instance) as T;
}

export async function deployMock(contractName: string, connect?: Signer): Promise<MockContract> {
    const artifact = await artifacts.readArtifact(contractName);
    const deployer = (await ethers.getSigners())[0];
    return waffle.deployMockContract(connect ?? deployer, artifact.abi);
}

export async function deployProxy<Contract>(contractName: string, forwarderAddress: string): Promise<Contract> {
    const MarketGSNFactory = await ethers.getContractFactory(contractName);
    return upgrades.deployProxy(MarketGSNFactory, ["un-used uri", forwarderAddress], {
        initializer: "init",
    }) as unknown as Contract;
}

import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@openzeppelin/hardhat-defender";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import "hardhat-storage-layout";

import "./tasks/accounts";
import "./tasks/clean";

import { resolve } from "path";

import { config as dotenvConfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const chainIds = {
    ganache: 1337,
    goerli: 5,
    hardhat: 31337,
    kovan: 42,
    mainnet: 1,
    rinkeby: 4,
    ropsten: 3,
    localhost: 31337,
};

// Ensure that we have all the environment variables we need.
const mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
    throw new Error("Please set your MNEMONIC in a .env file");
}

const infuraApiKey = process.env.INFURA_API_KEY;
if (!infuraApiKey) {
    throw new Error("Please set your INFURA_API_KEY in a .env file");
}

const defenderApiKey = process.env.DEFENDER_API_KEY;
const defenderSecret = process.env.DEFENDER_SECRET;

let defenderSettings = {};
if (defenderApiKey && defenderSecret) {
    defenderSettings = {
        defender: {
            apiKey: defenderApiKey,
            apiSecret: defenderSecret,
        },
    };
}

const etherscanKey = process.env.ETHERSCAN_API_KEY;
const etherscanSettings = { etherscan: { apiKey: etherscanKey } };

function createNetworkConfig(network: keyof typeof chainIds): NetworkUserConfig {
    let url: string = "https://" + network + ".infura.io/v3/" + infuraApiKey;

    if (network === "localhost") url = "http://localhost:8545";
    return {
        accounts: {
            count: 10,
            initialIndex: 0,
            mnemonic,
            path: "m/44'/60'/0'/0",
        },
        chainId: chainIds[network],
        url,
    };
}

const config: HardhatUserConfig = {
    defaultNetwork: "hardhat",
    namedAccounts: {
        deployer: 0, // Do not use this account for testing
        admin: 1,
    },
    gasReporter: {
        currency: "USD",
        enabled: process.env.REPORT_GAS ? true : false,
        excludeContracts: ["Test"],
        src: "./contracts",
    },
    networks: {
        hardhat: {
            accounts: {
                count: 10,
                initialIndex: 0,
                mnemonic,
                path: "m/44'/60'/0'/0",
            },
            chainId: chainIds.hardhat,
            hardfork: "london",
            forking: { url: "https://mainnet.infura.io/v3/" + infuraApiKey }, // eslint-disable-line
        },
        localhost: {
            ...createNetworkConfig("localhost"),
            saveDeployments: false,
        },
        goerli: createNetworkConfig("goerli"),
        kovan: createNetworkConfig("kovan"),
        rinkeby: createNetworkConfig("rinkeby"),
        ropsten: createNetworkConfig("ropsten"),
        mainnet: createNetworkConfig("mainnet"),
    },
    paths: {
        artifacts: "./artifacts",
        cache: "./cache",
        sources: "./contracts",
        tests: "./test",
    },
    solidity: {
        version: "0.8.4",
        settings: {
            metadata: {
                // Not including the metadata hash
                // https://github.com/paulrberg/solidity-template/issues/31
                bytecodeHash: "none",
            },
            // You should disable the optimizer when debugging
            // https://hardhat.org/hardhat-network/#solidity-optimizer-support
            optimizer: {
                enabled: true,
                runs: 1000,
            },
            outputSelection: {
                "*": {
                    "*": ["storageLayout"],
                },
            },
        },
    },
    typechain: {
        outDir: "typechain",
        target: "ethers-v5",
    },
    ...defenderSettings,
    ...etherscanSettings,
};

export default config;

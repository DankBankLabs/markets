# Dank Bank Market

## Tools used:

-   [Hardhat](https://github.com/nomiclabs/hardhat): compile and run the smart contracts on a local development network
-   [TypeChain](https://github.com/ethereum-ts/TypeChain): generate TypeScript types for smart contracts
-   [Ethers](https://github.com/ethers-io/ethers.js/): renowned Ethereum library and wallet implementation
-   [Waffle](https://github.com/EthWorks/Waffle): tooling for writing comprehensive smart contract tests
-   [Solhint](https://github.com/protofire/solhint): linter
-   [Solcover](https://github.com/sc-forks/solidity-coverage): code coverage
-   [Prettier Plugin Solidity](https://github.com/prettier-solidity/prettier-plugin-solidity): code formatter

# Etherscan verification

To try out Etherscan verification, you first need to deploy a contract to an Ethereum network that's supported by Etherscan, such as Ropsten.

In this project, copy the .env.example file to a file named .env, and then edit it to fill in the details. Enter your Etherscan/Polyscan API key and the MNEMONIC of the account which will send the deployment transaction. Updated the `arguments.js` file with the exact arguments for the constructor that were used to deploy the contract. With a valid .env and `argument.js` file in place, first deploy your contract

```shell
yarn deploy:matic
```

Then, run the verify task, passing the address of the contract replacing `DEPLOYED_CONTRACT_ADDRESS`, the network where it's deployed by replacing `NETWORK`:

```shell
npx hardhat verify --constructor-args arguments.js --network <NETWORK_NAME> <DEPLOYED_CONTRACT_ADDRESS>
```

## Usage

### Pre Requisites

Before running any command, make sure to install dependencies:

```sh
$ yarn install
```

### Compile

Compile the smart contracts with Hardhat:

```sh
$ yarn compile
```

### Run a local node

Expose a JSON-RPC interface to Hardhat Network

```sh
$ yarn start
```

### TypeChain

Compile the smart contracts and generate TypeChain artifacts:

```sh
$ yarn typechain
```

### Lint Solidity

Lint the Solidity code:

```sh
$ yarn lint:sol
```

### Lint TypeScript

Lint the TypeScript code:

```sh
$ yarn lint:ts
```

### Test

Run the Mocha tests:

```sh
$ yarn test
```

### Coverage

Generate the code coverage report:

```sh
$ yarn coverage
```

### Report Gas

See the gas usage per unit test and average gas per method call:

```sh
$ yarn test:gas
```

### Clean

Delete the smart contract artifacts, the coverage reports and the Hardhat cache:

```sh
$ yarn clean
```

### Deploy

Deploy the contracts to Hardhat Network:

```sh
$ yarn deploy
```

Deploy the contracts to a specific network, such as the Mainnet testnet:

```sh
$ yarn deploy:mainnet
```

Deployed contract addresses and other information regarding deployments can be found in the `.openzeppelin` folder

## Syntax Highlighting

If you use VSCode, you can enjoy syntax highlighting for your Solidity code via the
[vscode-solidity](https://github.com/juanfranblanco/vscode-solidity) extension. The recommended approach to set the
compiler version is to add the following fields to your VSCode user settings:

```json
{
    "solidity.compileUsingRemoteVersion": "v0.8.4+commit.c7e474f2",
    "solidity.defaultCompiler": "remote"
}
```

Where of course `v0.8.4+commit.c7e474f2` can be replaced with any other version.

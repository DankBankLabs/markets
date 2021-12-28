export const FEE_MULTIPLIER = 500;
export const MULTIPLIER_SUB_ONE = FEE_MULTIPLIER - 1;

export const USDC_CONTRACT_ADDRESS = Object.freeze({
    mainnet: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    goerli: "0x07865c6e87b9f70255377e024ace6630c1eaa37f",
});

export const CHAIN_ID_TO_NAME = Object.freeze({
    1337: "ganache",
    5: "goerli",
    31337: "localhost",
    42: "kovan",
    1: "mainnet",
    4: "rinkeby",
    3: "ropsten",
});

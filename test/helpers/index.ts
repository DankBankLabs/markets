import { BigNumber } from "ethers";

export * from "./deploy";

export const ONE = BigNumber.from(10).pow(18);
export const ZERO = BigNumber.from(0);

export const EVENTS = Object.freeze({
    LIQUIDITY_ADDED: "LiquidityAdded",
});

import { BigNumber } from "ethers";

import { FEE_MULTIPLIER, MULTIPLIER_SUB_ONE } from "./constants";

export const calculateSellEthOut = (
    tokensIn: BigNumber,
    tokenPool: BigNumber,
    ethPool: BigNumber
): BigNumber => {
    const scaledTokenPool = tokenPool.mul(FEE_MULTIPLIER);
    const scaledEthPool = ethPool.mul(MULTIPLIER_SUB_ONE);

    const divisor = scaledTokenPool.add(tokensIn.mul(MULTIPLIER_SUB_ONE));

    return scaledEthPool.mul(tokensIn).div(divisor);
}
import { BigNumber } from "ethers";

import { FEE_MULTIPLIER, MULTIPLIER_SUB_ONE } from "./constants";

export const calculateBuyTokensOut = (
    ethIn: BigNumber,
    ethPool: BigNumber,
    tokenPool: BigNumber
): BigNumber => {
    const scaledTokenPool = tokenPool.mul(MULTIPLIER_SUB_ONE);
    const scaledEthPool = ethPool.mul(FEE_MULTIPLIER);

    const divisor = scaledEthPool.add(ethIn.mul(MULTIPLIER_SUB_ONE));

    return scaledTokenPool.mul(ethIn).div(divisor);
}

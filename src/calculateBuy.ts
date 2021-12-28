import { BigNumber } from "ethers";

import { FEE_MULTIPLIER, MULTIPLIER_SUB_ONE } from "./constants";

export const calculateBuyTokensOut = (
    ethOrTokenIn: BigNumber,
    ethOrTokenPool: BigNumber,
    memeTokenPool: BigNumber,
): BigNumber => {
    const scaledTokenPool = memeTokenPool.mul(MULTIPLIER_SUB_ONE);
    const scaledEthPool = ethOrTokenPool.mul(FEE_MULTIPLIER);

    const divisor = scaledEthPool.add(ethOrTokenIn.mul(MULTIPLIER_SUB_ONE));

    return scaledTokenPool.mul(ethOrTokenIn).div(divisor);
};

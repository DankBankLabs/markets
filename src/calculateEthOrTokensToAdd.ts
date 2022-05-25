import { BigNumber } from "ethers";

export const calculateEthOrTokensToAdd = (
    inputAmount: BigNumber,
    totalEthOrPaymentTokenPoolSupply: BigNumber,
    memeTokenPoolSupply: BigNumber,
): BigNumber => inputAmount.mul(totalEthOrPaymentTokenPoolSupply).div(memeTokenPoolSupply);

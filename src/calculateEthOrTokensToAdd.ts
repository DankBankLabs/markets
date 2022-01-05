import { BigNumber } from "ethers";

export const calculateEthOrTokensToAdd = (
    inputAmount: BigNumber,
    ethOrPaymentTokenPoolSupply: BigNumber,
    memeTokenPoolSupply: BigNumber,
): BigNumber => inputAmount.mul(ethOrPaymentTokenPoolSupply).div(memeTokenPoolSupply);

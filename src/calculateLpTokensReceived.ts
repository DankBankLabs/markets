import { BigNumber } from "ethers";

export const calculateEthToAdd = (
    inputAmount: BigNumber,
    ethPoolSupply: BigNumber,
    tokenPoolSupply: BigNumber,
): BigNumber => inputAmount.mul(ethPoolSupply).div(tokenPoolSupply);

import ethSigUtil from "eth-sig-util";
import { Contract } from "ethers";

export const EIP712Domain = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
];

export async function domainSeparator(
    name: string,
    version: string,
    chainId: number,
    verifyingContract: Contract,
): Promise<string> {
    return (
        "0x" +
        ethSigUtil.TypedDataUtils.hashStruct(
            "EIP712Domain",
            { name, version, chainId, verifyingContract },
            { EIP712Domain },
        ).toString("hex")
    );
}

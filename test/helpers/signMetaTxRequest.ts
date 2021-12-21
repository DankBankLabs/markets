import { signTypedMessage } from "eth-sig-util";
import { Contract } from "ethers";

const EIP712Domain = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
];

const ForwardRequest = [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "data", type: "bytes" },
];

function getMetaTxTypeData(chainId: any, verifyingContract: any) {
    return {
        types: {
            EIP712Domain,
            ForwardRequest,
        },
        domain: {
            name: "MinimalForwarder",
            version: "0.0.1",
            chainId,
            verifyingContract,
        },
        primaryType: "ForwardRequest",
    };
}

async function signTypedData(privateKeyStr: string, data: any) {
    const privateKey = Buffer.from(privateKeyStr.replace(/^0x/, ""), "hex");
    return signTypedMessage(privateKey, { data });
}

type BuiltRequest = {
    value: number;
    gas: number;
    nonce: string;
};

export async function buildRequest(forwarder: Contract, input: MetaTxInput): Promise<BuiltRequest> {
    const nonce = await forwarder.getNonce(input.from).then((nonce: number) => nonce.toString());
    return { value: 0, gas: 1e6, nonce, ...input };
}

export async function buildTypedData(forwarder: Contract, request: BuiltRequest) {
    const chainId = await forwarder.provider.getNetwork().then((n: any) => n.chainId);
    const typeData = getMetaTxTypeData(chainId, forwarder.address);
    return { ...typeData, message: request };
}

type MetaTxInput = {
    to: string;
    from: string;
    data: string;
};

export async function signMetaTxRequest(privateKeyStr: string, forwarder: Contract, input: MetaTxInput) {
    const request = await buildRequest(forwarder, input);
    const toSign = await buildTypedData(forwarder, request);
    const signature = await signTypedData(privateKeyStr, toSign);
    return { signature, request };
}

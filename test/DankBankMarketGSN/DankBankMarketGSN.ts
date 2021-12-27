import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { deploy, deployProxy } from "../helpers";
import { DankBankMarketGSN, TestERC20, MinimalForwarder } from "../../typechain";
import { Signers } from "../../types";
import { shouldBehaveLikeMarketGSN } from "./DankBankMarketGSN.behavior";
import { EIP712Domain } from "../helpers/eip712";
import { Signer, Wallet } from "ethers";

const name = "MinimalForwarder";
const version = "0.0.1";

const setup = async (wallet: Wallet, walletSigner: Signer) => {
    const forwarder = await deploy<MinimalForwarder>("MinimalForwarder", { args: [], connect: walletSigner });
    const marketGSN = await deployProxy<DankBankMarketGSN>("DankBankMarketGSN", forwarder.address, walletSigner);
    const token = await deploy<TestERC20>("TestERC20", { args: [], connect: walletSigner });

    await token.mint(wallet.address, ethers.BigNumber.from(10).pow(18).mul(10000));

    return {
        forwarder,
        marketGSN,
        token,
    };
};

describe("Market", function () {
    before(async function () {
        this.signers = {} as Signers;

        const signers: SignerWithAddress[] = (await ethers.getSigners()) as unknown as SignerWithAddress[];
        const wallet = ethers.Wallet.fromMnemonic(process.env.MNEMONIC as string);
        const impersonatedSigner = await ethers.getSigner(wallet.address);

        this.wallet = wallet;
        this.walletSigner = impersonatedSigner;
        this.signers.other = signers[1];

        const deployment = await setup(this.wallet, this.walletSigner);
        this.forwarder = deployment.forwarder;
        this.marketGSN = deployment.marketGSN;
        this.token = deployment.token;
        console.log("Wallet address:", this.wallet.address);
        console.log("marketGSN address:", this.marketGSN.address);
        console.log("forwarder address:", this.forwarder.address);

        const defaultProvider = await ethers.getDefaultProvider();
        const chainId = (await defaultProvider.getNetwork()).chainId;

        this.domain = {
            name,
            version,
            chainId,
            verifyingContract: this.forwarder.address,
        };
        this.types = {
            EIP712Domain,
            ForwardRequest: [
                { name: "from", type: "address" },
                { name: "to", type: "address" },
                { name: "value", type: "uint256" },
                { name: "gas", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "data", type: "bytes" },
            ],
        };
    });

    shouldBehaveLikeMarketGSN();
});
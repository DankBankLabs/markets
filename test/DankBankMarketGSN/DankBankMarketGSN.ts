import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { deploy, deployProxy } from "../helpers";
import { DankBankMarketGSN, TestERC20, MinimalForwarder } from "../../typechain";
import { Signers } from "../../types";
import { shouldBehaveLikeMarketGSN } from "./DankBankMarketGSN.behavior";
import { EIP712Domain } from "../helpers/eip712";
import { Wallet } from "ethers";

const name = "MinimalForwarder";
const version = "0.0.1";

const setup = async (wallet: Wallet) => {
    const impersonatedSigner = await ethers.getSigner(wallet.address);
    const forwarder = await deploy<MinimalForwarder>("MinimalForwarder", { args: [], connect: impersonatedSigner });
    const marketGSN = await deployProxy<DankBankMarketGSN>("DankBankMarketGSN", forwarder.address, impersonatedSigner);
    const token = await deploy<TestERC20>("TestERC20", { args: [], connect: impersonatedSigner });

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

        this.signers.admin = signers[1];
        this.signers.other = signers[2];
        this.wallet = wallet;

        console.log("Admin address:", this.signers.admin.address);
        console.log("Wallet address:", this.wallet.address);

        const deployment = await setup(this.wallet);
        this.forwarder = deployment.forwarder;
        this.marketGSN = deployment.marketGSN;
        this.token = deployment.token;

        console.log("Forwarder address:", this.forwarder.address);
        console.log("MarketGSN address:", this.marketGSN.address);

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

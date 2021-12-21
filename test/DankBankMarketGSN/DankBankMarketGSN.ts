import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { deploy, deployProxy } from "../helpers";
import { DankBankMarketGSN, TestERC20, MinimalForwarder } from "../../typechain";
import { Signers } from "../../types";
import { shouldBehaveLikeMarketGSN } from "./DankBankMarketGSN.behavior";
import { EIP712Domain } from "../helpers/eip712";

const name = "MinimalForwarder";
const version = "0.0.1";

const setup = async (admin: SignerWithAddress) => {
    const forwarder = await deploy<MinimalForwarder>("MinimalForwarder", { args: [], connect: admin });
    const marketGSN = await deployProxy<DankBankMarketGSN>("DankBankMarketGSN", forwarder.address);
    const token = await deploy<TestERC20>("TestERC20", { args: [], connect: admin });

    await token.mint(admin.address, ethers.BigNumber.from(10).pow(18).mul(10000));

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
        const wallet = ethers.Wallet.createRandom();
        this.signers.admin = signers[1];
        this.signers.other = signers[2];
        this.wallet = wallet;

        const deployment = await setup(this.signers.admin);
        this.forwarder = deployment.forwarder;
        this.marketGSN = deployment.marketGSN;
        this.token = deployment.token;

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

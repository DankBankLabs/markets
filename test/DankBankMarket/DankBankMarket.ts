import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { deploy } from "../helpers";
import { DankBankMarket, TestERC20 } from "../../typechain";
import { Signers } from "../../types";
import { shouldBehaveLikeMarket } from "./DankBankMarket.behavior";

const setup = async (admin: SignerWithAddress) => {
    const market = await deploy<DankBankMarket>("DankBankMarket", { args: [], connect: admin });
    // implementation contract is automatically initialized in the constructor
    // await market.init("TestURI");
    const token = await deploy<TestERC20>("TestERC20", { args: [], connect: admin });

    await token.mint(admin.address, ethers.BigNumber.from(10).pow(18).mul(10000));

    return {
        market,
        token
    };
};

describe("Market", function () {
    before(async function () {
        this.signers = {} as Signers;

        const signers: SignerWithAddress[] = ((await ethers.getSigners()) as unknown) as SignerWithAddress[];
        this.signers.admin = signers[1];
        this.signers.other = signers[2];

        const deployment = await setup(this.signers.admin);
        this.market = deployment.market;
        this.token = deployment.token;
    });

    shouldBehaveLikeMarket();
});

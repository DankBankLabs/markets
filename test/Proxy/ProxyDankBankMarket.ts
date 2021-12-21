import { ethers, artifacts } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { deploy } from "../helpers";
import { DankBankMarket, TestERC20, ProxyAdmin, TransparentUpgradeableProxy } from "../../typechain";
import { Signers } from "../../types";
import { shouldBehaveLikeMarket } from "../DankBankMarket/DankBankMarket.behavior";

const setup = async (admin: SignerWithAddress) => {
    const market = await deploy<DankBankMarket>("DankBankMarket", { args: [], connect: admin });
    const proxyAdmin = await deploy<ProxyAdmin>("ProxyAdmin", { args: [], connect: admin });

    const initializeData = Buffer.from("");
    const proxy = await deploy<TransparentUpgradeableProxy>("TransparentUpgradeableProxy", {
        args: [market.address, proxyAdmin.address, initializeData],
        connect: admin,
    });
    const token = await deploy<TestERC20>("TestERC20", { args: [], connect: admin });

    const DANK_MARKET_ABI = artifacts.readArtifactSync("DankBankMarket").abi;
    const proxyMarket = new ethers.Contract(proxy.address, DANK_MARKET_ABI, admin);

    await token.mint(admin.address, ethers.BigNumber.from(10).pow(18).mul(10000));

    return {
        proxyMarket,
        token,
    };
};

describe("ProxyMarket", function () {
    before(async function () {
        this.signers = {} as Signers;

        const signers: SignerWithAddress[] = (await ethers.getSigners()) as unknown as SignerWithAddress[];
        this.signers.admin = signers[1];
        this.signers.other = signers[2];

        const deployment = await setup(this.signers.admin);
        this.market = deployment.proxyMarket;
        this.token = deployment.token;
    });

    shouldBehaveLikeMarket();
});

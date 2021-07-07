import hre from "hardhat";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { DankBankMarket } from "../typechain/Greeter";
import { Signers } from "../types";
import { shouldBehaveLikeMarket } from "./DankBankMarket.behavior";

const { deployContract } = hre.waffle;

describe("Unit tests", function () {
    before(async function () {
        this.signers = {} as Signers;

        const signers: SignerWithAddress[] = await hre.ethers.getSigners();
        this.signers.admin = signers[0];
    });

    describe("Market", function () {
        beforeEach(async function () {
            const marketArtifact: Artifact = await hre.artifacts.readArtifact("DankBankMarket");
            this.market = <DankBankMarket>await deployContract(this.signers.admin, marketArtifact, []);
        });

        shouldBehaveLikeMarket();
    });
});

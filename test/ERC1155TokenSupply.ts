import hre from "hardhat";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { TestERC1155 } from "../typechain";
import { Signers } from "../types";
import { shouldBehaveLikeERC115TokenSupply } from "./ERC1155TokenSupply.behavior";

const { deployContract } = hre.waffle;

describe("Unit tests", function () {
    before(async function () {
        this.signers = {} as Signers;

        const signers: SignerWithAddress[] = await hre.ethers.getSigners();
        this.signers.admin = signers[0];
    });

    describe("Market", function () {
        before(async function () {
            const contractArtifact: Artifact = await hre.artifacts.readArtifact("TestERC1155");
            this.contract = <TestERC1155>await deployContract(this.signers.admin, contractArtifact, []);
        });

        shouldBehaveLikeERC115TokenSupply();
    });
});

import { expect } from "chai";
import { BigNumber } from "ethers";

export function shouldBehaveLikeERC115TokenSupply(): void {
    const tokenId = 1;
    const otherTokenId = 2;
    let supply: BigNumber;
    let otherSupply: BigNumber;

    it("token should have no supply initially", async function () {
        const supply = await this.contract.lpTokenSupply(tokenId);
        expect(supply.toString()).to.equal("0");
    });

    it("should update token supply after minting", async function () {
        const mintAmount = "100";

        const address = await this.signers.admin.getAddress();
        await this.contract.connect(this.signers.admin).mint(address, tokenId, mintAmount);

        supply = await this.contract.lpTokenSupply(tokenId);
        expect(supply.toString()).to.equal(mintAmount);
    });

    it("should update the supply after burning", async function () {
        const burnAmount = "50";

        const address = await this.signers.admin.getAddress();
        await this.contract.connect(this.signers.admin).burn(address, tokenId, burnAmount);

        const expectedSupply = supply.sub(burnAmount);
        supply = await this.contract.lpTokenSupply(tokenId);
        expect(supply.toString()).to.equal(expectedSupply.toString());
    });

    it("should update supplies after mintBatch", async function () {
        const mintAmounts = ["50", "25"];

        const address = await this.signers.admin.getAddress();
        await this.contract.connect(this.signers.admin).mintBatch(address, [tokenId, otherTokenId], mintAmounts);

        const expectedSupply = supply.add(mintAmounts[0]);
        supply = await this.contract.lpTokenSupply(tokenId);
        expect(supply.toString()).to.equal(expectedSupply.toString());

        otherSupply = await this.contract.lpTokenSupply(otherTokenId);
        expect(otherSupply.toString()).to.equal(mintAmounts[1]);
    });

    it("updates supplies after burnBatch", async function () {
        const burnAmounts = ["20", "10"];

        const address = await this.signers.admin.getAddress();
        await this.contract.connect(this.signers.admin).burnBatch(address, [tokenId, otherTokenId], burnAmounts);

        const expectedSupply = supply.sub(burnAmounts[0]);
        supply = await this.contract.lpTokenSupply(tokenId);
        expect(supply.toString()).to.equal(expectedSupply.toString());

        const expectedOtherSupply = otherSupply.sub(burnAmounts[1]);
        otherSupply = await this.contract.lpTokenSupply(otherTokenId);
        expect(otherSupply.toString()).to.equal(expectedOtherSupply.toString());
    });
}

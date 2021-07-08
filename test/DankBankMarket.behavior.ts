import { expect } from "chai";
import { constants, utils, BigNumber } from "ethers";
import { ONE } from "./helpers";

export function shouldBehaveLikeMarket(): void {
    let expectedVirtualEthSupply: BigNumber;

    it("reverts adding liquidity if token is not approved", async function () {
        await expect(this.market.addLiquidity(
            this.token.address,
            ONE,
            ONE,
            ONE
        )).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });

    it("tokenId is the address of the token", async function () {
        const tokenId = await this.market.getTokenId(this.token.address);

        expect(tokenId.toHexString().toLowerCase()).to.equal(this.token.address.toLowerCase());
    })

    it("adds liquidity", async function () {
        await this.token.approve(this.market.address, constants.MaxUint256);

        await expect(this.market.addLiquidity(
            this.token.address,
            ONE,
            ONE,
            ONE,
        )).to.emit(this.market, "LiquidityAdded").withArgs(this.signers.admin.address, this.token.address, ONE, ONE);

        expectedVirtualEthSupply = ONE;

        const lpShares = await this.market.balanceOf(this.signers.admin.address, this.token.address);

        expect(lpShares.toString()).to.equal(ONE.toString());
    });

    it("has the expected virtual eth supply", async function () {
        const virtualEthPoolSupply = await this.market.virtualEthPoolSupply(this.token.address);

        expect(virtualEthPoolSupply.toString()).to.equal(expectedVirtualEthSupply.toString());
    });

    it("able to add subsequent liquidity", async function () {
        const lpTokenSupply = await this.market.lpTokenSupply(this.token.address);
        const inputAmount = ONE;
        const poolBalance = await this.token.balanceOf(this.market.address);

        const expectedMintAmount = inputAmount.mul(lpTokenSupply).div(poolBalance);

        await expect(this.market.addLiquidity(
            this.token.address,
            ONE,
            ONE,
            ONE,
        )).to.emit(this.market, "LiquidityAdded").withArgs(this.signers.admin.address, this.token.address, inputAmount, expectedMintAmount);
    });

    it("reverts when minOutputShares is less than desired", async function () {
        const lpTokenSupply = await this.market.lpTokenSupply(this.token.address);
        const inputAmount = ONE;
        const poolBalance = await this.token.balanceOf(this.market.address);

        const expectedMintAmount = inputAmount.mul(lpTokenSupply).div(poolBalance);

        await expect(this.market.addLiquidity(
            this.token.address,
            ONE,
            expectedMintAmount.add(1),
            ONE,
        )).to.be.revertedWith("DankBankMarket: output shares less than required.");
    });
}

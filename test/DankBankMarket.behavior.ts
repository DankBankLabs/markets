import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { constants, utils, BigNumber } from "ethers";
import { ONE } from "./helpers";

export function shouldBehaveLikeMarket(): void {
    let expectedVirtualEthSupply: BigNumber;
    let expectedEthBalance: BigNumber;
    let expectedTokensOut: BigNumber;

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

    it("calc buy amount is as expected", async function () {
        const ethIn = ONE;
        expectedEthBalance = ethIn;
        const fee = ONE.div(await this.market.FEE_DIVISOR());

        const tokenPool = await this.token.balanceOf(this.market.address);
        const ethPool = await this.market.getTotalEthPoolSupply(this.token.address);

        const invariant = tokenPool.mul(ethPool);
        const newTokenPool = invariant.div(ethPool.add(ethIn).sub(fee));
        expectedTokensOut = tokenPool.sub(newTokenPool);

        const buyAmount = await this.market.calculateBuyEthOut(this.token.address, ethIn);
        expect(buyAmount.toString()).to.equal(expectedTokensOut.toString());
    });

    let tokenBalanceBeforeTrade: BigNumber;

    it("allows buying tokens", async function () {
        const ethIn = ONE;
        expectedEthBalance = ethIn;
        const fee = ONE.div(await this.market.FEE_DIVISOR());

        const tokenPool = await this.token.balanceOf(this.market.address);
        const ethPool = await this.market.getTotalEthPoolSupply(this.token.address);

        const invariant = tokenPool.mul(ethPool);
        const newTokenPool = invariant.div(ethPool.add(ethIn).sub(fee));
        expectedTokensOut = tokenPool.sub(newTokenPool);

        tokenBalanceBeforeTrade = await this.token.balanceOf(this.signers.admin.address);

        await expect(this.market.buy(this.token.address, expectedTokensOut, {
            value: ethIn,
        })).to.emit(this.market, "DankBankBuy").withArgs(
            this.signers.admin.address,
            this.token.address,
            ethIn,
            expectedTokensOut,
        );
    });

    it("user token balance is as expected", async function () {
        const tokenBalance = await this.token.balanceOf(this.signers.admin.address);

        expect(tokenBalance.toString()).to.equal(expectedTokensOut.add(tokenBalanceBeforeTrade).toString());
    })

    it("eth balance is as expected", async function () {
        const ethBalance = await ethers.provider.getBalance(this.market.address);

        expect(ethBalance.toString()).to.equal(expectedEthBalance.toString());
    });

    it("eth pool balance is as expected", async function () {
        const ethPoolBalance = await this.market.ethPoolSupply(this.token.address);

        expect(ethPoolBalance.toString()).to.equal(expectedEthBalance.toString());
    });

    it("reverts when minTokenOut is not enough", async function () {
        const ethIn = ONE;
        expectedEthBalance = ethIn;
        const fee = ONE.div(await this.market.FEE_DIVISOR());

        const tokenPool = await this.token.balanceOf(this.market.address);
        const ethPool = await this.market.getTotalEthPoolSupply(this.token.address);

        const invariant = tokenPool.mul(ethPool);
        const newTokenPool = invariant.div(ethPool.add(ethIn).sub(fee));
        const expectedTokensOut = tokenPool.sub(newTokenPool);

        await expect(this.market.buy(this.token.address, expectedTokensOut.add(1), {
            value: ethIn,
        })).to.be.revertedWith("DankBankMarket: Insufficient tokens out.");
    });

    it("calc sell amount is as expected", async function () {
        const tokensIn = expectedTokensOut.div(2);
        const fee = tokensIn.div(await this.market.FEE_DIVISOR());

        const tokenPool = await this.token.balanceOf(this.market.address);
        const ethPool = await this.market.getTotalEthPoolSupply(this.token.address);
        const invariant = tokenPool.mul(ethPool);

        newEthPool = invariant.div(tokenPool.add(tokensIn).sub(fee));
        expectedEthOut = ethPool.sub(newEthPool);

        const sellAmount = await this.market.calculateSellTokensOut(this.token.address, tokensIn);
        expect(sellAmount.toString()).to.equal(expectedEthOut.toString());
    });

    let expectedEthOut: BigNumber;
    let newEthPool: BigNumber;

    it("able to sell tokens", async function () {
        const tokensIn = expectedTokensOut.div(2);
        const fee = tokensIn.div(await this.market.FEE_DIVISOR());

        const tokenPool = await this.token.balanceOf(this.market.address);
        const ethPool = await this.market.getTotalEthPoolSupply(this.token.address);
        const invariant = tokenPool.mul(ethPool);

        newEthPool = invariant.div(tokenPool.add(tokensIn).sub(fee));
        expectedEthOut = ethPool.sub(newEthPool);

        await expect(
            this.market.sell(this.token.address, tokensIn, expectedEthOut)
        ).to.emit(this.market, "DankBankSell").withArgs(
            this.signers.admin.address,
            this.token.address,
            expectedEthOut,
            tokensIn,
        );
    });

    it("new eth pool is as expected", async function () {
        const ethPool = await this.market.getTotalEthPoolSupply(this.token.address);

        expect(ethPool.toString()).to.equal(newEthPool.toString());
    });

    it("eth out is as expected", async function () {
        const tokensIn = expectedTokensOut.div(2);
        const fee = tokensIn.div(await this.market.FEE_DIVISOR());

        const tokenPool = await this.token.balanceOf(this.market.address);
        const ethPool = await this.market.getTotalEthPoolSupply(this.token.address);
        const invariant = tokenPool.mul(ethPool);

        newEthPool = invariant.div(tokenPool.add(tokensIn).sub(fee));
        expectedEthOut = ethPool.sub(newEthPool);

        const ethBefore = await ethers.provider.getBalance(this.signers.admin.address);

        const tx = await this.market.sell(this.token.address, tokensIn, expectedEthOut);

        const receipt = await tx.wait();

        const ethFee = tx.gasPrice.mul(receipt.gasUsed);

        const expectedEthAfter = ethBefore.add(expectedEthOut).sub(ethFee);

        const ethAfter = await ethers.provider.getBalance(this.signers.admin.address);

        expect(ethAfter.toString()).to.equal(expectedEthAfter.toString());
    });

    it("unable to sell more tokens than ethPool supports", async function () {
        const userBalance = await this.token.balanceOf(this.signers.admin.address);

        await expect(
            this.market.sell(this.token.address, userBalance, 0)
        ).to.be.revertedWith("reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)");
    });

    it("unable to sell more tokens than a user has", async function () {
        const signer = this.signers.other;

        const balance = await this.token.balanceOf(signer.address);

        expect(balance.toString()).to.equal("0");

        await expect(
            this.market.connect(signer).sell(this.token.address, 10, 0)
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    let lpTokenBalance: BigNumber;
    let expectedTokenBalanceAfter: BigNumber

    it("able to remove liquidity", async function () {
        lpTokenBalance = await this.market.balanceOf(this.signers.admin.address, this.token.address);
        const lpTokenSupply = await this.market.lpTokenSupply(this.token.address);

        const burnAmount = lpTokenBalance.div(2);

        const ethRemoved = burnAmount.mul(await this.market.ethPoolSupply(this.token.address)).div(lpTokenSupply);
        const tokensRemoved = burnAmount.mul(await this.token.balanceOf(this.market.address)).div(lpTokenSupply);

        const tokenBalanceBefore = await this.token.balanceOf(this.signers.admin.address);

        expectedTokenBalanceAfter = tokenBalanceBefore.add(tokensRemoved);

        await expect(
            this.market.removeLiquidity(this.token.address, burnAmount)
        ).to.emit(this.market, "LiquidityRemoved").withArgs(
            this.signers.admin.address,
            this.token.address,
            tokensRemoved,
            ethRemoved,
            burnAmount,
        );
    });

    it("token balance updated with tokens removed from liquidity", async function () {
        const tokenBalance = await this.token.balanceOf(this.signers.admin.address);

        expect(tokenBalance.toString()).to.equal(expectedTokenBalanceAfter.toString());
    });

    it("lp tokens were burned", async function () {
        const expectedLpTokenSupply = lpTokenBalance.div(2);

        const lpTokenSupply = await this.market.lpTokenSupply(this.token.address);

        expect(lpTokenSupply.toString()).to.equal(expectedLpTokenSupply.toString());
    });

    it("reverts trying to burn more lp tokens than someone has", async function () {
        const signer = this.signers.other;

        await expect(
            this.market.connect(signer).removeLiquidity(this.token.address, await this.market.lpTokenSupply(this.token.address))
        ).to.be.revertedWith("ERC1155: burn amount exceeds balance");
    });

    it("reverts trying to burn more tokens than in pool", async function () {
        await expect(
            this.market.removeLiquidity(this.token.address, (await this.market.lpTokenSupply(this.token.address)).add(1))
        ).to.be.revertedWith("panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)");
    });

    it("able to remove rest of liquidity", async function () {
        const burnAmount = await this.market.balanceOf(this.signers.admin.address, this.token.address);
        const lpTokenSupply = await this.market.lpTokenSupply(this.token.address);

        const ethRemoved = burnAmount.mul(await this.market.ethPoolSupply(this.token.address)).div(lpTokenSupply);
        const tokensRemoved = burnAmount.mul(await this.token.balanceOf(this.market.address)).div(lpTokenSupply);

        const tokenBalanceBefore = await this.token.balanceOf(this.signers.admin.address);

        expectedTokenBalanceAfter = tokenBalanceBefore.add(tokensRemoved);

        await expect(
            this.market.removeLiquidity(this.token.address, burnAmount)
        ).to.emit(this.market, "LiquidityRemoved").withArgs(
            this.signers.admin.address,
            this.token.address,
            tokensRemoved,
            ethRemoved,
            burnAmount,
        );
    })
}

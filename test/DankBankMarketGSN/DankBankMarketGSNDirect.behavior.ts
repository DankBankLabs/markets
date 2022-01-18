import { expect } from "chai";
import { ethers } from "hardhat";
import { constants, BigNumber } from "ethers";
import { ONE, deploy, ZERO } from "../helpers";
import { TestERC20 } from "../../typechain";
import {
    calculateBuyTokensOut,
    calculateEthOrTokensToAdd,
    calculateSellEthOrTokenOut,
    calculateSellTokensIn,
} from "../../src";

export function shouldBehaveLikeMarketGSNDirect(): void {
    let expectedMemeTokensOut: BigNumber;
    let expectedPaymentTokenBalance: BigNumber;

    it("tokenId is the address of the token", async function () {
        const tokenId = await this.marketGSN.getTokenId(this.token.address);

        expect(tokenId.toHexString().toLowerCase()).to.equal(this.token.address.toLowerCase());
    });

    describe("add initial liquidity", async function () {
        let expectedVirtualTokenSupply: BigNumber;

        it("reverts adding liquidity if token is not approved directly", async function () {
            await expect(this.marketGSN.initPool(this.token.address, ONE, ZERO, ONE)).to.be.revertedWith(
                "ERC20: transfer amount exceeds allowance",
            );
        });

        it("reverts if input amount is 0", async function () {
            await expect(this.marketGSN.initPool(this.token.address, 0, 0, ONE)).to.be.revertedWith(
                "DankBankMarket: initial pool amounts must be greater than 0.",
            );
        });

        it("reverts if initial virtual eth supply is 0", async function () {
            await expect(this.marketGSN.initPool(this.token.address, ONE, 0, 0)).to.be.revertedWith(
                "DankBankMarket: initial pool amounts must be greater than 0.",
            );
        });

        it("adds liquidity directly", async function () {
            await this.token.approve(this.marketGSN.address, constants.MaxUint256);
            await this.paymentToken.approve(this.marketGSN.address, constants.MaxUint256);

            await expect(this.marketGSN.initPool(this.token.address, ONE, 0, ONE))
                .to.emit(this.marketGSN, "LiquidityAdded")
                .withArgs(this.wallet.address, this.token.address, ONE, ZERO, ONE);

            expectedVirtualTokenSupply = ONE;

            const lpShares = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);

            expect(lpShares.toString()).to.equal(ONE.toString());
        });

        it("has the expected virtual token supply", async function () {
            const virtualTokenPoolSupply = await this.marketGSN.virtualTokenPoolSupply(this.token.address);

            expect(virtualTokenPoolSupply.toString()).to.equal(expectedVirtualTokenSupply.toString());
        });

        it("has the expected eth pool supply", async function () {
            const tokenPoolSupply = await this.marketGSN.tokenPoolSupply(this.token.address);

            expect(tokenPoolSupply.toNumber()).to.equal(0);
        });

        it("reverts if pool is already initialized", async function () {
            await expect(this.marketGSN.initPool(this.token.address, ONE, 0, ONE)).to.be.revertedWith(
                "DankBankMarket: pool already initialized",
            );
        });
    });

    describe("add initial liquidity with an initial eth pool supply", function () {
        let otherToken: TestERC20;
        const virtualTokenPoolSupply = ONE;
        const tokenPoolSupply = ONE;

        it("adds liquidity using meta transaction", async function () {
            otherToken = await deploy<TestERC20>("TestERC20", { args: [], connect: this.walletSigner });

            await otherToken.mint(this.wallet.address, ethers.BigNumber.from(10).pow(18).mul(10000));

            await otherToken.approve(this.marketGSN.address, constants.MaxUint256);
            await this.paymentToken.approve(this.marketGSN.address, constants.MaxUint256);

            const expectedLpShares = virtualTokenPoolSupply.add(tokenPoolSupply);

            await expect(this.marketGSN.initPool(otherToken.address, ONE, ONE, ONE))
                .to.emit(this.marketGSN, "LiquidityAdded")
                .withArgs(this.wallet.address, otherToken.address, ONE, ONE, expectedLpShares);

            const lpShares = await this.marketGSN.balanceOf(this.wallet.address, otherToken.address);

            expect(lpShares.toString()).to.equal(expectedLpShares.toString());
        });

        it("has the expected virtual payment token supply", async function () {
            const virtualTokenPoolSupply = await this.marketGSN.virtualTokenPoolSupply(otherToken.address);
            const expectedVirtualTokenSupply = ONE;

            expect(virtualTokenPoolSupply.toString()).to.equal(expectedVirtualTokenSupply.toString());
        });

        it("has the expected payment token pool supply", async function () {
            const expectedPaymentTokenBalance = await this.paymentToken.balanceOf(this.marketGSN.address);
            const tokenPoolSupply = await this.marketGSN.tokenPoolSupply(otherToken.address);
            const expectedTokenPoolSupply = ONE;

            expect(expectedPaymentTokenBalance.toString()).to.equal(expectedTokenPoolSupply.toString());
            expect(tokenPoolSupply.toString()).to.equal(expectedTokenPoolSupply.toString());
        });
    });

    describe("buy tokens", function () {
        it("calculates buy amount as expected", async function () {
            const paymentTokensIn = ONE;
            expectedPaymentTokenBalance = paymentTokensIn;

            const memeTokenPool = await this.token.balanceOf(this.marketGSN.address);
            const paymentTokenPool = await this.marketGSN.getTotalTokenPoolSupply(this.token.address);

            expectedMemeTokensOut = calculateBuyTokensOut(paymentTokensIn, paymentTokenPool, memeTokenPool);

            const buyAmount = await this.marketGSN.calculateBuyTokensOut(this.token.address, paymentTokensIn);
            expect(buyAmount.toString()).to.equal(expectedMemeTokensOut.toString());
        });

        let tokenBalanceBeforeTrade: BigNumber;
        const paymentTokensIn = ONE;
        let marketPaymentTokenBalanceBeforeTrade: BigNumber;

        it("allows buying tokens", async function () {
            const memeTokenPool = await this.token.balanceOf(this.marketGSN.address);
            const paymentTokenPool = await this.marketGSN.getTotalTokenPoolSupply(this.token.address);

            expectedMemeTokensOut = calculateBuyTokensOut(paymentTokensIn, paymentTokenPool, memeTokenPool);

            tokenBalanceBeforeTrade = await this.token.balanceOf(this.wallet.address);
            marketPaymentTokenBalanceBeforeTrade = await this.paymentToken.balanceOf(this.marketGSN.address);

            await expect(
                this.marketGSN.buy(this.token.address, paymentTokensIn, expectedMemeTokensOut),
            )
                .to.emit(this.marketGSN, "DankBankBuy")
                .withArgs(
                    this.wallet.address,
                    this.token.address,
                    paymentTokensIn,
                    expectedMemeTokensOut
                );

            const tokenBalanceAfterTrade = await this.token.balanceOf(this.wallet.address);
            const expectedBuyAmount = tokenBalanceAfterTrade.sub(tokenBalanceBeforeTrade);

            expect(expectedBuyAmount).to.be.eq(expectedMemeTokensOut);
        });

        it("user payment and meme token balance is as expected", async function () {
            const memeTokenBalance = await this.token.balanceOf(this.wallet.address);
            const marketPaymentTokenBalance = await this.paymentToken.balanceOf(this.marketGSN.address);

            expect(
                marketPaymentTokenBalance.sub(
                    marketPaymentTokenBalanceBeforeTrade
                ) .toString()
            ).to.equal(paymentTokensIn.toString());
            expect(memeTokenBalance.toString()).to.equal(expectedMemeTokensOut.add(tokenBalanceBeforeTrade).toString());
        });

        it("token pool balance is as expected", async function () {
            const paymentTokenPoolBalance = await this.marketGSN.tokenPoolSupply(this.token.address);

            expect(paymentTokenPoolBalance.toString()).to.equal(expectedPaymentTokenBalance.toString());
        });

        it("reverts when minTokenOut is not enough", async function () {
            const paymentTokensIn = ONE;

            const tokenPool = await this.token.balanceOf(this.marketGSN.address);
            const tokenPaymentPool = await this.marketGSN.getTotalTokenPoolSupply(this.token.address);

            const expectedMemeTokensOut = calculateBuyTokensOut(paymentTokensIn, tokenPaymentPool, tokenPool);

            await expect(
                this.marketGSN.buy(this.token.address, paymentTokensIn, expectedMemeTokensOut.add(1)),
            ).to.be.revertedWith("DankBankMarket: Insufficient meme tokens out.");
        });
    });

    describe("add subsequent liquidity", function () {
        let ratioBefore: BigNumber;

        it("able to add subsequent liquidity", async function () {
            const inputPaymentTokenAmount = ONE;
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);
            const memeTokenPoolBalance = await this.token.balanceOf(this.marketGSN.address);
            const paymentTokenBalanceBefore = await this.paymentToken.balanceOf(this.marketGSN.address);

            const paymentTokenPoolSupply = await this.marketGSN.tokenPoolSupply(this.token.address);

            const expectedMintAmount = inputPaymentTokenAmount.mul(lpTokenSupply).div(memeTokenPoolBalance);

            const paymentTokensToAdd = calculateEthOrTokensToAdd(
                inputPaymentTokenAmount,
                paymentTokenPoolSupply,
                memeTokenPoolBalance,
            );

            ratioBefore = (await this.marketGSN.virtualTokenPoolSupply(this.token.address)).div(paymentTokenPoolSupply);

            await expect(this.marketGSN.addLiquidity(this.token.address, ONE, paymentTokensToAdd, paymentTokensToAdd))
                .to.emit(this.marketGSN, "LiquidityAdded")
                .withArgs(
                    this.wallet.address,
                    this.token.address,
                    inputPaymentTokenAmount,
                    paymentTokensToAdd,
                    expectedMintAmount
                );

            const paymentTokenBalanceAfter = await this.paymentToken.balanceOf(this.marketGSN.address);
            expect(paymentTokenBalanceAfter.toString()).to.equal(
                paymentTokenBalanceBefore.add(paymentTokensToAdd).toString(),
            );
        });

        it("adding liquidity keeps the payment token to virtual payment token ratio the same", async function () {
            const ratioAfter = (await this.marketGSN.virtualTokenPoolSupply(this.token.address)).div(
                await this.marketGSN.tokenPoolSupply(this.token.address),
            );

            expect(ratioAfter.toString()).to.equal(ratioBefore.toString());
        });

        it("reverts when not enough eth is supplied as liquidity", async function () {
            await expect(this.marketGSN.addLiquidity(this.token.address, 1, 0, 0)).to.be.revertedWith(
                "DankBankMarket: insufficient payment token supplied.",
            );
        });

        it("reverts when less than minPaymentTokenAdded is added", async function () {
            const inputAmount = ONE;
            const poolBalance = await this.token.balanceOf(this.marketGSN.address);

            const paymentTokenPoolSupply = await this.marketGSN.tokenPoolSupply(this.token.address);
            const paymentTokenToAdd = calculateEthOrTokensToAdd(inputAmount, paymentTokenPoolSupply, poolBalance);

            await expect(
                this.marketGSN.addLiquidity(
                    this.token.address, 1, paymentTokenToAdd, paymentTokenToAdd.add(1)
                ),
            ).to.be.revertedWith("DankBankMarket: Payment token supplied less than minimum required.");
        });
    });

    describe("sell tokens", function () {
        let expectedPaymentTokensOut: BigNumber;
        let memeTokensIn: BigNumber;
        let prevPaymentTokenPool: BigNumber;

        it("calc sell amount is as expected", async function () {
            memeTokensIn = ONE;

            const memeTokenPool = await this.token.balanceOf(this.marketGSN.address);
            prevPaymentTokenPool = await this.marketGSN.getTotalTokenPoolSupply(this.token.address);

            expectedPaymentTokensOut = calculateSellEthOrTokenOut(memeTokensIn, memeTokenPool, prevPaymentTokenPool);

            const sellAmount = await this.marketGSN.calculateSellPaymentTokenOut(this.token.address, memeTokensIn);
            expect(sellAmount.toString()).to.equal(expectedPaymentTokensOut.toString());
        });

        it("able to sell tokens", async function () {
            const userPaymentTokenBalanceBefore = await this.paymentToken.balanceOf(this.wallet.address);
            const userMemeTokenBalanceBefore = await this.token.balanceOf(this.wallet.address);

            await expect(this.marketGSN.sell(this.token.address, memeTokensIn, expectedPaymentTokensOut))
                .to.emit(this.marketGSN, "DankBankSell")
                .withArgs(
                    this.wallet.address,
                    this.token.address,
                    expectedPaymentTokensOut,
                    memeTokensIn
                );

            const userPaymentTokenBalanceAfter = await this.paymentToken.balanceOf(this.wallet.address);
            const userMemeTokenBalanceAfter = await this.token.balanceOf(this.wallet.address);

            expect(userPaymentTokenBalanceAfter.toString()).to.equal(
                userPaymentTokenBalanceBefore.add(expectedPaymentTokensOut),
            );
            expect(userMemeTokenBalanceAfter.toString()).to.equal(userMemeTokenBalanceBefore.sub(memeTokensIn));
        });

        it("new payment token pool is as expected", async function () {
            const expectedPaymentTokenPool = prevPaymentTokenPool.sub(expectedPaymentTokensOut);

            const paymentTokenPool = await this.marketGSN.getTotalTokenPoolSupply(this.token.address);

            expect(paymentTokenPool.toString()).to.equal(expectedPaymentTokenPool.toString());
        });

        it("token payment out is as expected", async function () {
            const memeTokensIn = expectedMemeTokensOut.div(2);
            const memeTokenPool = await this.token.balanceOf(this.marketGSN.address);
            const paymentTokenPool = await this.marketGSN.getTotalTokenPoolSupply(this.token.address);

            expectedPaymentTokensOut = calculateSellEthOrTokenOut(memeTokensIn, memeTokenPool, paymentTokenPool);

            const userPaymentTokenBalanceBefore = await this.paymentToken.balanceOf(this.wallet.address);

            await this.marketGSN.sell(this.token.address, memeTokensIn, expectedPaymentTokensOut);

            const expectedUserPaymentTokenBalanceAfter = userPaymentTokenBalanceBefore.add(expectedPaymentTokensOut);

            const userPaymentTokenBalanceAfter = await this.paymentToken.balanceOf(this.wallet.address);

            expect(expectedUserPaymentTokenBalanceAfter.toString()).to.equal(userPaymentTokenBalanceAfter.toString());
        });

        it("test calculateSellTokensIn()", async function () {
            const MAX = 9;
            const MIN = 1;
            const memeTokensIn = expectedMemeTokensOut.div(Math.floor(Math.random() * MAX) + MIN);
            const memeTokenPool = await this.token.balanceOf(this.marketGSN.address);
            const paymentTokenPool = await this.marketGSN.getTotalTokenPoolSupply(this.token.address);

            expectedPaymentTokensOut = calculateSellEthOrTokenOut(memeTokensIn, memeTokenPool, paymentTokenPool);
            const expectedTokensIn = calculateSellTokensIn(expectedPaymentTokensOut, memeTokenPool, paymentTokenPool);

            expect(expectedTokensIn.toString()).to.equal(memeTokensIn.toString());
        });

        it("unable to sell more tokens than ethPool supports", async function () {
            const userBalanceBefore = await this.token.balanceOf(this.wallet.address);

            await expect(this.marketGSN.sell(this.token.address, userBalanceBefore, 0)).to.be.revertedWith(
                "DankBankMarket: Market has insufficient liquidity for the trade.",
            );

            const userBalanceAfter = await this.token.balanceOf(this.wallet.address);
            expect(userBalanceAfter.toString()).to.equal(userBalanceBefore.toString());
        });

        it("unable to sell more tokens than a user has", async function () {
            const signer = this.signers.other;

            const balance = await this.token.balanceOf(signer.address);

            expect(balance.toString()).to.equal("0");

            await expect(
                this.marketGSN.connect(signer).sell(this.token.address, 10, 0)
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });
    });

    describe("remove liquidity", function () {
        let lpTokenBalance: BigNumber;
        let burnAmount: BigNumber;
        let expectedMemeTokenBalanceAfter: BigNumber;
        let paymentTokenRatioBefore: BigNumber;

        it("able to remove liquidity", async function () {
            const userMemeTokenBalanceBefore = await this.token.balanceOf(this.wallet.address);
            const userPaymentTokenBalanceBefore = await this.paymentToken.balanceOf(this.wallet.address);

            lpTokenBalance = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            burnAmount = lpTokenBalance.div(2);

            const paymentTokenPoolSupply = await this.marketGSN.tokenPoolSupply(this.token.address);

            const paymentTokensRemoved = burnAmount.mul(paymentTokenPoolSupply).div(lpTokenSupply);
            const memeTokensRemoved = burnAmount
                .mul(await this.token.balanceOf(this.marketGSN.address))
                .div(lpTokenSupply);

            const memeTokenBalanceBefore = await this.token.balanceOf(this.wallet.address);

            expectedMemeTokenBalanceAfter = memeTokenBalanceBefore.add(memeTokensRemoved);

            paymentTokenRatioBefore = (await this.marketGSN.virtualTokenPoolSupply(this.token.address)).div(
                paymentTokenPoolSupply,
            );

            await expect(this.marketGSN.removeLiquidity(this.token.address, burnAmount, memeTokensRemoved, paymentTokensRemoved))
                .to.emit(this.marketGSN, "LiquidityRemoved")
                .withArgs(this.wallet.address, this.token.address, memeTokensRemoved, paymentTokensRemoved, burnAmount);

            const userMemeTokenBalanceAfter = await this.token.balanceOf(this.wallet.address);
            const userPaymentTokenBalanceAfter = await this.paymentToken.balanceOf(this.wallet.address);

            expect(userMemeTokenBalanceAfter.toString()).to.equal(
                userMemeTokenBalanceBefore.add(memeTokensRemoved).toString(),
            );
            expect(userPaymentTokenBalanceAfter.toString()).to.equal(
                userPaymentTokenBalanceBefore.add(paymentTokensRemoved).toString(),
            );
        });

        it("keeps payment token to virtual payment token ratio the same on removing liquidity", async function () {
            const paymentTokenRatioAfter = (await this.marketGSN.virtualTokenPoolSupply(this.token.address)).div(
                await this.marketGSN.tokenPoolSupply(this.token.address),
            );

            expect(paymentTokenRatioBefore.toString()).to.equal(paymentTokenRatioAfter.toString());
        });

        it("meme token balance updated with tokens removed from liquidity", async function () {
            const tokenBalance = await this.token.balanceOf(this.wallet.address);

            expect(tokenBalance.toString()).to.equal(expectedMemeTokenBalanceAfter.toString());
        });

        it("lp tokens were burned", async function () {
            const expectedLpTokenSupply = lpTokenBalance.sub(burnAmount);

            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            expect(lpTokenSupply.toString()).to.equal(expectedLpTokenSupply.toString());
        });

        it("reverts trying to burn more lp tokens than someone has", async function () {
            const signer = this.signers.other;

            await expect(
                this.marketGSN
                    .connect(signer)
                    .removeLiquidity(
                        this.token.address,
                        await this.marketGSN.lpTokenSupply(this.token.address),
                        0,
                        0
                    ),
            ).to.be.revertedWith("ERC1155: burn amount exceeds balance");
        });

        it("reverts trying to burn more tokens than in pool", async function () {
            await expect(
                this.marketGSN.removeLiquidity(
                    this.token.address,
                    (await this.marketGSN.lpTokenSupply(this.token.address)).add(1),
                    0,
                    0,
                ),
            ).to.be.revertedWith(
                "panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
            );
        });

        it("reverts when receiving less tokens than desired", async function () {
            const burnAmount = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            const paymentTokensRemoved = burnAmount
                .mul(await this.marketGSN.tokenPoolSupply(this.token.address))
                .div(lpTokenSupply);
            const memeTokensRemoved = burnAmount
                .mul(await this.token.balanceOf(this.marketGSN.address))
                .div(lpTokenSupply);

            await expect(
                this.marketGSN.removeLiquidity(
                    this.token.address,
                    burnAmount,
                    memeTokensRemoved.add(1),
                    paymentTokensRemoved
                ),
            ).to.be.revertedWith("DankBankMarket: Meme token out is less than minimum specified");

            const burnAmountAfter = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);

            expect(burnAmount.toString()).to.equal(burnAmountAfter.toString());
        });

        it("reverts when receiving less eth than desired", async function () {
            const burnAmount = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            const paymentTokensRemoved = burnAmount
                .mul(await this.marketGSN.tokenPoolSupply(this.token.address))
                .div(lpTokenSupply);
            const memeTokensRemoved = burnAmount
                .mul(await this.token.balanceOf(this.marketGSN.address))
                .div(lpTokenSupply);

            await expect(
                this.marketGSN.removeLiquidity(
                    this.token.address,
                    burnAmount,
                    memeTokensRemoved,
                    paymentTokensRemoved.add(1)
                ),
            ).to.be.revertedWith("DankBankMarket: Payment tokens out is less than minimum tokens specified");

            const burnAmountAfter = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);

            expect(burnAmount.toString()).to.equal(burnAmountAfter.toString());
        });

        it("able to remove rest of liquidity", async function () {
            const burnAmount = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            const paymentTokensRemoved = burnAmount
                .mul(await this.marketGSN.tokenPoolSupply(this.token.address))
                .div(lpTokenSupply);
            const memeTokensRemoved = burnAmount
                .mul(await this.token.balanceOf(this.marketGSN.address))
                .div(lpTokenSupply);

            const tokenBalanceBefore = await this.token.balanceOf(this.wallet.address);

            expectedMemeTokenBalanceAfter = tokenBalanceBefore.add(memeTokensRemoved);

            await expect(
                this.marketGSN.removeLiquidity(
                    this.token.address,
                    burnAmount,
                    memeTokensRemoved,
                    paymentTokensRemoved
                )
            )
            .to.emit(this.marketGSN, "LiquidityRemoved")
            .withArgs(
                this.wallet.address,
                this.token.address,
                memeTokensRemoved,
                paymentTokensRemoved,
                burnAmount
            );

            const burnAmountAfter = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);
            const tokenBalanceAfter = await this.token.balanceOf(this.wallet.address);

            expect(burnAmountAfter.toString()).to.equal(ZERO);
            expect(tokenBalanceAfter.toString()).to.equal(expectedMemeTokenBalanceAfter.toString());
        });
    });
}

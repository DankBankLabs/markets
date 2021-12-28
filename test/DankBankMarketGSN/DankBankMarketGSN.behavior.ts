import { expect } from "chai";
import { ethers } from "hardhat";
import { constants, BigNumber, Contract, Wallet } from "ethers";
import { ONE, deploy, EVENTS, ZERO } from "../helpers";
import { TestERC20 } from "../../typechain";
import {
    calculateBuyTokensOut,
    calculateEthOrTokensToAdd,
    calculateSellEthOrTokenOut,
    calculateSellTokensIn,
} from "../../src";
import { signMetaTxRequest } from "../helpers/signMetaTxRequest";
import { relay } from "../helpers/relay";
import { TransactionReceipt } from "@ethersproject/providers";

function expectEventEmitted(transactionReceipt, eventName: string) {
    expect(transactionReceipt.events.some((event: any) => "event" in event && event?.event === eventName)).to.be.true;
}

function expectEventNotToBeEmitted(transactionReceipt, eventName: string) {
    expect(transactionReceipt.events.find((event: any) => "event" in event && event?.event === eventName)).to.be
        .undefined;
}

export function shouldBehaveLikeMarketGSN(): void {
    let expectedMemeTokensOut: BigNumber;
    let expectedPaymentTokenBalance: BigNumber;

    async function relayFunctionCall(
        wallet: Wallet,
        forwarder: Contract,
        marketContract: Contract,
        methodName: string,
        methodArgs: any[],
    ): Promise<TransactionReceipt> {
        const { request, signature } = await signMetaTxRequest(wallet.privateKey, forwarder, {
            from: wallet.address,
            to: marketContract.address,
            data: marketContract.interface.encodeFunctionData(methodName, [...methodArgs]),
        });
        const whitelist = [marketContract.address];
        return relay(forwarder, request, signature, whitelist);
    }

    it("recognizes trusted forwarder", async function () {
        expect(await this.marketGSN.isTrustedForwarder(this.forwarder.address)).to.equal(true);
    });

    it("tokenId is the address of the token", async function () {
        const tokenId = await this.marketGSN.getTokenId(this.token.address);

        expect(tokenId.toHexString().toLowerCase()).to.equal(this.token.address.toLowerCase());
    });

    it("relays get tokenId", async function () {
        const response = await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "getTokenId", [
            this.token.address,
        ]);
        expect(response.status === 1).to.equal(true);
    });

    describe("add initial liquidity", async function () {
        let expectedVirtualTokenSupply: BigNumber;

        it("reverts adding liquidity if token is not approved using meta transaction", async function () {
            const methodArgs = [this.token.address, ONE, ZERO, ONE];
            await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "initPool", methodArgs);
            const lpShares = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);

            expect(lpShares.toString()).to.equal(ZERO.toString());
        });

        it.only("adds liquidity using meta transaction", async function () {
            await this.token.approve(this.marketGSN.address, constants.MaxUint256);
            await this.paymentToken.approve(this.marketGSN.address, constants.MaxUint256);

            const methodArgs = [this.token.address, ONE, ZERO, ONE];
            await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "initPool", methodArgs);

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

            const methodArgs = [otherToken.address, ONE, ONE, ONE];
            await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "initPool", methodArgs);

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

        it.only("allows buying tokens", async function () {
            const memeTokenPool = await this.token.balanceOf(this.marketGSN.address);
            const paymentTokenPool = await this.marketGSN.getTotalTokenPoolSupply(this.token.address);

            expectedMemeTokensOut = calculateBuyTokensOut(paymentTokensIn, paymentTokenPool, memeTokenPool);

            tokenBalanceBeforeTrade = await this.token.balanceOf(this.wallet.address);

            const methodArgs = [this.token.address, paymentTokensIn, expectedMemeTokensOut];
            await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "buy", methodArgs);

            const tokenBalanceAfterTrade = await this.token.balanceOf(this.wallet.address);
            const expectedBuyAmount = tokenBalanceAfterTrade.sub(tokenBalanceBeforeTrade);

            expect(expectedBuyAmount).to.be.eq(expectedMemeTokensOut);
        });

        it("user payment and meme token balance is as expected", async function () {
            const memeTokenBalance = await this.token.balanceOf(this.wallet.address);
            const marketPaymentTokenBalance = await this.paymentToken.balanceOf(this.marketGSN.address);

            expect(marketPaymentTokenBalance.toString()).to.equal(paymentTokensIn.toString());
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

            const methodArgs = [this.token.address, paymentTokensIn, expectedMemeTokensOut.add(1)];
            const response = await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "buy", methodArgs);

            expectEventNotToBeEmitted(response, EVENTS.BUY);
        });
    });

    describe("add subsequent liquidity", function () {
        let ratioBefore: BigNumber;

        it.only("able to add subsequent liquidity", async function () {
            const inputPaymentTokenAmount = ONE;
            const memeTokenPoolBalance = await this.token.balanceOf(this.marketGSN.address);
            const paymentTokenBalanceBefore = await this.paymentToken.balanceOf(this.marketGSN.address);

            const paymentTokenPoolSupply = await this.marketGSN.tokenPoolSupply(this.token.address);

            const paymentTokensToAdd = calculateEthOrTokensToAdd(
                inputPaymentTokenAmount,
                paymentTokenPoolSupply,
                memeTokenPoolBalance,
            );

            ratioBefore = (await this.marketGSN.virtualTokenPoolSupply(this.token.address)).div(paymentTokenPoolSupply);

            const methodArgs = [this.token.address, ONE, paymentTokensToAdd, paymentTokensToAdd];
            await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "addLiquidity", methodArgs);

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
            const methodArgs = [this.token.address, 1, 0, 1];
            const resp = await relayFunctionCall(
                this.wallet,
                this.forwarder,
                this.marketGSN,
                "addLiquidity",
                methodArgs,
            );

            expectEventNotToBeEmitted(resp, EVENTS.LIQUIDITY_ADDED);
        });

        it("reverts when less than minPaymentTokenAdded is added", async function () {
            const inputAmount = ONE;
            const poolBalance = await this.token.balanceOf(this.marketGSN.address);

            const paymentTokenPoolSupply = await this.marketGSN.tokenPoolSupply(this.token.address);
            const paymentTokenToAdd = calculateEthOrTokensToAdd(inputAmount, paymentTokenPoolSupply, poolBalance);

            const methodArgs = [this.token.address, 1, paymentTokenToAdd, paymentTokenToAdd.add(1)];
            const resp = await relayFunctionCall(
                this.wallet,
                this.forwarder,
                this.marketGSN,
                "addLiquidity",
                methodArgs,
            );
            expectEventNotToBeEmitted(resp, EVENTS.LIQUIDITY_ADDED);
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

            const methodArgs = [this.token.address, memeTokensIn, expectedPaymentTokensOut];
            await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "sell", methodArgs);

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

            const methodArgs = [this.token.address, memeTokensIn, expectedPaymentTokensOut];
            await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "sell", methodArgs);

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

            const methodArgs = [this.token.address, userBalanceBefore, 0];
            const response = await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "sell", methodArgs);

            const userBalanceAfter = await this.token.balanceOf(this.wallet.address);
            expect(userBalanceAfter.toString()).to.equal(userBalanceBefore.toString());
            expectEventNotToBeEmitted(response, EVENTS.SELL);
        });

        it("unable to sell more tokens than a user has", async function () {
            const userBalanceBeforeTransfer = await this.token.balanceOf(this.wallet.address);
            await this.token.approve(this.wallet.address, ONE);
            await this.token.transferFrom(this.wallet.address, this.signers.other.address, ONE);

            const memeTokenPool = await this.token.balanceOf(this.marketGSN.address);
            const paymentTokenPool = await this.marketGSN.getTotalTokenPoolSupply(this.token.address);
            const failedPaymentTokensOut = calculateSellEthOrTokenOut(
                userBalanceBeforeTransfer,
                memeTokenPool,
                paymentTokenPool,
            );

            const methodArgs = [this.token.address, userBalanceBeforeTransfer, failedPaymentTokensOut];
            const response = await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "sell", methodArgs);
            const userBalanceAfterAttemptedSell = await this.token.balanceOf(this.wallet.address);

            expect(userBalanceAfterAttemptedSell.toString()).to.equal(userBalanceBeforeTransfer.sub(ONE).toString());
            expectEventNotToBeEmitted(response, EVENTS.SELL);
        });
    });

    describe("remove liquidity", function () {
        let lpTokenBalance: BigNumber;
        let burnAmount: BigNumber;
        let expectedMemeTokenBalanceAfter: BigNumber;
        let paymentTokenRatioBefore: BigNumber;

        it.only("able to remove liquidity", async function () {
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

            const methodArgs = [this.token.address, burnAmount, memeTokensRemoved, paymentTokensRemoved];
            await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "removeLiquidity", methodArgs);

            const userMemeTokenBalanceAfter = await this.token.balanceOf(this.wallet.address);
            const userPaymentTokenBalanceAfter = await this.paymentToken.balanceOf(this.wallet.address);

            expect(userMemeTokenBalanceAfter.toString()).to.equal(
                userMemeTokenBalanceBefore.add(memeTokensRemoved).toString(),
            );
            expect(userPaymentTokenBalanceAfter.toString()).to.equal(
                userPaymentTokenBalanceBefore.add(paymentTokensRemoved).toString(),
            );
        });

        it.only("keeps payment token to virtual payment token ratio the same on removing liquidity", async function () {
            const paymentTokenRatioAfter = (await this.marketGSN.virtualTokenPoolSupply(this.token.address)).div(
                await this.marketGSN.tokenPoolSupply(this.token.address),
            );

            expect(paymentTokenRatioBefore.toString()).to.equal(paymentTokenRatioAfter.toString());
        });

        it.only("meme token balance updated with tokens removed from liquidity", async function () {
            const tokenBalance = await this.token.balanceOf(this.wallet.address);

            expect(tokenBalance.toString()).to.equal(expectedMemeTokenBalanceAfter.toString());
        });

        it.only("lp tokens were burned", async function () {
            const expectedLpTokenSupply = lpTokenBalance.sub(burnAmount);

            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            expect(lpTokenSupply.toString()).to.equal(expectedLpTokenSupply.toString());
        });

        it.only("reverts trying to burn more tokens than in pool and/or users balance", async function () {
            const userLPTokenSupplyBefore = await this.marketGSN.lpTokenSupply(this.token.address);

            const methodArgs = [this.token.address, userLPTokenSupplyBefore.add(ONE), 0, 0];
            const response = await relayFunctionCall(
                this.wallet,
                this.forwarder,
                this.marketGSN,
                "removeLiquidity",
                methodArgs,
            );

            const userLPTokenSupplyAfter = await this.marketGSN.lpTokenSupply(this.token.address);

            expect(userLPTokenSupplyAfter.toString()).to.equal(userLPTokenSupplyBefore.toString());
            expectEventNotToBeEmitted(response, EVENTS.LIQUIDITY_REMOVED);
        });

        it.only("reverts when receiving less tokens than desired", async function () {
            const burnAmount = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            const paymentTokensRemoved = burnAmount
                .mul(await this.marketGSN.tokenPoolSupply(this.token.address))
                .div(lpTokenSupply);
            const memeTokensRemoved = burnAmount
                .mul(await this.token.balanceOf(this.marketGSN.address))
                .div(lpTokenSupply);

            const methodArgs = [this.token.address, burnAmount, memeTokensRemoved.add(1), paymentTokensRemoved];
            const response = await relayFunctionCall(
                this.wallet,
                this.forwarder,
                this.marketGSN,
                "removeLiquidity",
                methodArgs,
            );
            const burnAmountAfter = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);

            expect(burnAmount.toString()).to.equal(burnAmountAfter.toString());
            expectEventNotToBeEmitted(response, EVENTS.LIQUIDITY_REMOVED);
        });

        it.only("reverts when receiving less eth than desired", async function () {
            const burnAmount = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            const paymentTokensRemoved = burnAmount
                .mul(await this.marketGSN.tokenPoolSupply(this.token.address))
                .div(lpTokenSupply);
            const memeTokensRemoved = burnAmount
                .mul(await this.token.balanceOf(this.marketGSN.address))
                .div(lpTokenSupply);

            const methodArgs = [this.token.address, burnAmount, memeTokensRemoved, paymentTokensRemoved.add(1)];
            const response = await relayFunctionCall(
                this.wallet,
                this.forwarder,
                this.marketGSN,
                "removeLiquidity",
                methodArgs,
            );
            const burnAmountAfter = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);

            expect(burnAmount.toString()).to.equal(burnAmountAfter.toString());
            expectEventNotToBeEmitted(response, EVENTS.LIQUIDITY_REMOVED);
        });

        it.only("able to remove rest of liquidity", async function () {
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

            const methodArgs = [this.token.address, burnAmount, memeTokensRemoved, paymentTokensRemoved];
            await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "removeLiquidity", methodArgs);

            const burnAmountAfter = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);
            const tokenBalanceAfter = await this.token.balanceOf(this.wallet.address);

            expect(burnAmountAfter.toString()).to.equal(ZERO);
            expect(tokenBalanceAfter.toString()).to.equal(expectedMemeTokenBalanceAfter.toString());
        });
    });
}

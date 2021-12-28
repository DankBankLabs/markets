import { expect } from "chai";
import { ethers } from "hardhat";
import { constants, BigNumber, Contract, Wallet } from "ethers";
import { ONE, deploy, EVENTS, ZERO } from "../helpers";
import { TestERC20 } from "../../typechain";
import {
    calculateBuyTokensOut,
    calculateEthOrTokensToAdd,
    calculateSellEthOut,
    calculateSellTokensIn,
} from "../../src";
import { signMetaTxRequest } from "../helpers/signMetaTxRequest";
import { relay } from "../helpers/relay";
import { TransactionReceipt } from "@ethersproject/providers";

function expectEventEmitted(transactionReceipt, eventName: string) {
    expect(transactionReceipt.events.some((event: any) => "event" in event && event?.event === eventName));
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
            const response = await relayFunctionCall(
                this.wallet,
                this.forwarder,
                this.marketGSN,
                "initPool",
                methodArgs,
            );
            const lpShares = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);

            expectEventNotToBeEmitted(response, EVENTS.LIQUIDITY_ADDED);
            expect(lpShares.toString()).to.equal(ZERO.toString());
        });

        it.only("adds liquidity using meta transaction", async function () {
            await this.token.approve(this.marketGSN.address, constants.MaxUint256);
            await this.paymentToken.approve(this.marketGSN.address, constants.MaxUint256);

            const methodArgs = [this.token.address, ONE, ZERO, ONE];
            const resp = await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "initPool", methodArgs);

            expectedVirtualTokenSupply = ONE;

            const lpShares = await this.marketGSN.balanceOf(this.wallet.address, this.token.address);

            expectEventEmitted(resp, EVENTS.LIQUIDITY_ADDED);
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

        it.only("adds liquidity using meta transaction", async function () {
            otherToken = await deploy<TestERC20>("TestERC20", { args: [], connect: this.walletSigner });

            await otherToken.mint(this.wallet.address, ethers.BigNumber.from(10).pow(18).mul(10000));

            await otherToken.approve(this.marketGSN.address, constants.MaxUint256);
            await this.paymentToken.approve(this.marketGSN.address, constants.MaxUint256);

            const expectedLpShares = virtualTokenPoolSupply.add(tokenPoolSupply);

            const methodArgs = [otherToken.address, ONE, ONE, ONE];
            const resp = await relayFunctionCall(
                this.wallet,
                this.forwarder,
                this.marketGSN,
                "addLiquidity",
                methodArgs,
            );

            const lpShares = await this.marketGSN.balanceOf(this.wallet.address, otherToken.address);

            expectEventEmitted(resp, EVENTS.LIQUIDITY_ADDED);
            expect(lpShares.toString()).to.equal(expectedLpShares.toString());
        });

        it("has the expected virtual eth supply", async function () {
            const virtualTokenPoolSupply = await this.marketGSN.virtualTokenPoolSupply(otherToken.address);
            const expectedVirtualTokenSupply = ONE;

            expect(virtualTokenPoolSupply.toString()).to.equal(expectedVirtualTokenSupply.toString());
        });

        it("has the expected eth pool supply", async function () {
            const tokenPoolSupply = await this.marketGSN.tokenPoolSupply(otherToken.address);
            const expectedTokenPoolSupply = ONE;

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

        it("allows buying tokens", async function () {
            const paymentTokensIn = ONE;

            const memeTokenPool = await this.token.balanceOf(this.marketGSN.address);
            const paymentTokenPool = await this.marketGSN.getTotalTokenPoolSupply(this.token.address);

            expectedMemeTokensOut = calculateBuyTokensOut(paymentTokensIn, paymentTokenPool, memeTokenPool);

            tokenBalanceBeforeTrade = await this.token.balanceOf(this.wallet.address);

            const methodArgs = [this.token.address, paymentTokensIn, expectedMemeTokensOut];
            const response = await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "buy", methodArgs);

            const tokenBalanceAfterTrade = await this.token.balanceOf(this.wallet.address);
            const expectedBuyAmount = tokenBalanceAfterTrade.sub(tokenBalanceBeforeTrade);

            expect(expectedBuyAmount).to.be.eq(expectedMemeTokensOut);
            expectEventNotToBeEmitted(response, EVENTS.BUY);
        });

        it("user token balance is as expected", async function () {
            const memeTokenBalance = await this.token.balanceOf(this.wallet.address);

            expect(memeTokenBalance.toString()).to.equal(expectedMemeTokensOut.add(tokenBalanceBeforeTrade).toString());
        });

        it("eth pool balance is as expected", async function () {
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
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);
            const inputPaymentTokenAmount = ONE;
            const memeTokenPoolBalance = await this.token.balanceOf(this.marketGSN.address);

            const expectedMintAmount = inputPaymentTokenAmount.mul(lpTokenSupply).div(memeTokenPoolBalance);

            const paymentTokenPoolSupply = await this.marketGSN.tokenPoolSupply(this.token.address);
            const paymentTokensToAdd = calculateEthOrTokensToAdd(
                inputPaymentTokenAmount,
                paymentTokenPoolSupply,
                memeTokenPoolBalance,
            );

            ratioBefore = (await this.marketGSN.virtualTokenPoolSupply(this.token.address)).div(paymentTokenPoolSupply);

            const methodArgs = [this.token.address, ONE, inputPaymentTokenAmount, paymentTokensToAdd];
            const resp = await relayFunctionCall(
                this.wallet,
                this.forwarder,
                this.marketGSN,
                "addLiquidity",
                methodArgs,
            );

            expectEventEmitted(resp, EVENTS.LIQUIDITY_ADDED);

            await expect(
                this.marketGSN.addLiquidity(this.token.address, ONE, paymentTokensToAdd, { value: paymentTokensToAdd }),
            )
                .to.emit(this.marketGSN, "LiquidityAdded")
                .withArgs(this.signers.admin.address, this.token.address, inputPaymentTokenAmount, expectedMintAmount);
        });

        it("adding liquidity keeps the eth to virtual eth ratio the same", async function () {
            const ratioAfter = (await this.marketGSN.virtualEthPoolSupply(this.token.address)).div(
                await this.marketGSN.ethPoolSupply(this.token.address),
            );

            expect(ratioAfter.toString()).to.equal(ratioBefore.toString());
        });

        it("reverts when not enough eth is supplied as liquidity", async function () {
            await expect(this.marketGSN.addLiquidity(this.token.address, 1, 0)).to.be.revertedWith(
                "DankBankMarket: insufficient ETH supplied.",
            );
        });

        it("reverts when less than minEthAdded is added", async function () {
            const inputAmount = ONE;
            const poolBalance = await this.token.balanceOf(this.marketGSN.address);

            const ethPoolSupply = await this.marketGSN.ethPoolSupply(this.token.address);
            const ethToAdd = calculateEthOrTokensToAdd(inputAmount, ethPoolSupply, poolBalance);

            await expect(
                this.marketGSN.addLiquidity(this.token.address, 1, ethToAdd.add(1), { value: ethToAdd }),
            ).to.be.revertedWith("DankBankMarket: ETH supplied less than minimum required.");
        });
    });

    describe("sell tokens", function () {
        let expectedEthOut: BigNumber;
        let tokensIn: BigNumber;
        let prevEthPool: BigNumber;

        it("calc sell amount is as expected", async function () {
            tokensIn = expectedMemeTokensOut.div(2);

            const tokenPool = await this.token.balanceOf(this.marketGSN.address);
            prevEthPool = await this.marketGSN.getTotalEthPoolSupply(this.token.address);

            expectedEthOut = calculateSellEthOut(tokensIn, tokenPool, prevEthPool);

            const sellAmount = await this.marketGSN.calculateSellEthOut(this.token.address, tokensIn);
            expect(sellAmount.toString()).to.equal(expectedEthOut.toString());
        });

        it("able to sell tokens", async function () {
            await expect(this.marketGSN.sell(this.token.address, tokensIn, expectedEthOut))
                .to.emit(this.marketGSN, "DankBankSell")
                .withArgs(this.signers.admin.address, this.token.address, expectedEthOut, tokensIn);
        });

        it("new eth pool is as expected", async function () {
            const expectedEthPool = prevEthPool.sub(expectedEthOut);

            const ethPool = await this.marketGSN.getTotalEthPoolSupply(this.token.address);

            expect(ethPool.toString()).to.equal(expectedEthPool.toString());
        });

        it("eth out is as expected", async function () {
            const tokensIn = expectedMemeTokensOut.div(2);
            const tokenPool = await this.token.balanceOf(this.marketGSN.address);
            const ethPool = await this.marketGSN.getTotalEthPoolSupply(this.token.address);

            expectedEthOut = calculateSellEthOut(tokensIn, tokenPool, ethPool);

            const ethBefore = await ethers.provider.getBalance(this.signers.admin.address);

            const tx = await this.marketGSN.sell(this.token.address, tokensIn, expectedEthOut);

            const receipt = await tx.wait();

            const ethFee = tx.gasPrice.mul(receipt.gasUsed);

            const expectedEthAfter = ethBefore.add(expectedEthOut).sub(ethFee);

            const ethAfter = await ethers.provider.getBalance(this.signers.admin.address);

            expect(ethAfter.toString()).to.equal(expectedEthAfter.toString());
        });

        it("test calculateSellTokensIn()", async function () {
            const MAX = 9;
            const MIN = 1;
            const tokensIn = expectedMemeTokensOut.div(Math.floor(Math.random() * MAX) + MIN);
            const tokenPool = await this.token.balanceOf(this.marketGSN.address);
            const ethPool = await this.marketGSN.getTotalEthPoolSupply(this.token.address);

            expectedEthOut = calculateSellEthOut(tokensIn, tokenPool, ethPool);
            const expectedTokensIn = calculateSellTokensIn(expectedEthOut, tokenPool, ethPool);

            expect(expectedTokensIn.toString()).to.equal(tokensIn.toString());
        });

        it("unable to sell more tokens than ethPool supports", async function () {
            const userBalance = await this.token.balanceOf(this.signers.admin.address);

            await expect(this.marketGSN.sell(this.token.address, userBalance, 0)).to.be.revertedWith(
                "DankBankMarket: Market has insufficient liquidity for the trade.",
            );
        });

        it("unable to sell more tokens than a user has", async function () {
            const signer = this.signers.other;

            const balance = await this.token.balanceOf(signer.address);

            expect(balance.toString()).to.equal("0");

            await expect(this.marketGSN.connect(signer).sell(this.token.address, 10, 0)).to.be.revertedWith(
                "ERC20: transfer amount exceeds balance",
            );
        });
    });

    describe("remove liquidity", function () {
        let lpTokenBalance: BigNumber;
        let burnAmount: BigNumber;
        let expectedTokenBalanceAfter: BigNumber;
        let ethRatioBefore: BigNumber;

        it("able to remove liquidity", async function () {
            lpTokenBalance = await this.marketGSN.balanceOf(this.signers.admin.address, this.token.address);
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            burnAmount = lpTokenBalance.div(2);

            const ethPoolSupply = await this.marketGSN.ethPoolSupply(this.token.address);

            const ethRemoved = burnAmount.mul(ethPoolSupply).div(lpTokenSupply);
            const tokensRemoved = burnAmount.mul(await this.token.balanceOf(this.marketGSN.address)).div(lpTokenSupply);

            const tokenBalanceBefore = await this.token.balanceOf(this.signers.admin.address);

            expectedTokenBalanceAfter = tokenBalanceBefore.add(tokensRemoved);

            ethRatioBefore = (await this.marketGSN.virtualEthPoolSupply(this.token.address)).div(ethPoolSupply);

            await expect(this.marketGSN.removeLiquidity(this.token.address, burnAmount, tokensRemoved, ethRemoved))
                .to.emit(this.marketGSN, "LiquidityRemoved")
                .withArgs(this.signers.admin.address, this.token.address, tokensRemoved, ethRemoved, burnAmount);
        });

        it("keeps eth to virtual eth ratio the same on removing liqudity", async function () {
            const ethRatioAfter = (await this.marketGSN.virtualEthPoolSupply(this.token.address)).div(
                await this.marketGSN.ethPoolSupply(this.token.address),
            );

            expect(ethRatioBefore.toString()).to.equal(ethRatioAfter.toString());
        });

        it("token balance updated with tokens removed from liquidity", async function () {
            const tokenBalance = await this.token.balanceOf(this.signers.admin.address);

            expect(tokenBalance.toString()).to.equal(expectedTokenBalanceAfter.toString());
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
                    .removeLiquidity(this.token.address, await this.marketGSN.lpTokenSupply(this.token.address), 0, 0),
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
            const burnAmount = await this.marketGSN.balanceOf(this.signers.admin.address, this.token.address);
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            const ethRemoved = burnAmount
                .mul(await this.marketGSN.ethPoolSupply(this.token.address))
                .div(lpTokenSupply);
            const tokensRemoved = burnAmount.mul(await this.token.balanceOf(this.marketGSN.address)).div(lpTokenSupply);

            await expect(
                this.marketGSN.removeLiquidity(this.token.address, burnAmount, tokensRemoved.add(1), ethRemoved),
            ).to.be.revertedWith("DankBankMarket: Token out is less than minimum specified");
        });

        it("reverts when receiving less eth than desired", async function () {
            const burnAmount = await this.marketGSN.balanceOf(this.signers.admin.address, this.token.address);
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            const ethRemoved = burnAmount
                .mul(await this.marketGSN.ethPoolSupply(this.token.address))
                .div(lpTokenSupply);
            const tokensRemoved = burnAmount.mul(await this.token.balanceOf(this.marketGSN.address)).div(lpTokenSupply);

            await expect(
                this.marketGSN.removeLiquidity(this.token.address, burnAmount, tokensRemoved, ethRemoved.add(1)),
            ).to.be.revertedWith("DankBankMarket: ETH out is less than minimum ETH specified");
        });

        it("able to remove rest of liquidity", async function () {
            const burnAmount = await this.marketGSN.balanceOf(this.signers.admin.address, this.token.address);
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);

            const ethRemoved = burnAmount
                .mul(await this.marketGSN.ethPoolSupply(this.token.address))
                .div(lpTokenSupply);
            const tokensRemoved = burnAmount.mul(await this.token.balanceOf(this.marketGSN.address)).div(lpTokenSupply);

            const tokenBalanceBefore = await this.token.balanceOf(this.signers.admin.address);

            expectedTokenBalanceAfter = tokenBalanceBefore.add(tokensRemoved);

            await expect(this.marketGSN.removeLiquidity(this.token.address, burnAmount, tokensRemoved, ethRemoved))
                .to.emit(this.marketGSN, "LiquidityRemoved")
                .withArgs(this.signers.admin.address, this.token.address, tokensRemoved, ethRemoved, burnAmount);
        });
    });

    describe("storage layout", function () {
        it("should have _status as the last slot in layout", async function () {
            const _status = await ethers.provider.getStorageAt(this.marketGSN.address, 154);
            const emptySlot = await ethers.provider.getStorageAt(this.marketGSN.address, 155);
            expect(parseInt(_status, 16)).to.eq(1);
            expect(parseInt(emptySlot, 16)).to.eq(0);
        });
    });
}

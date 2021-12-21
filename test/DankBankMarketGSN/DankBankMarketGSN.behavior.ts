import { expect } from "chai";
import { ethers } from "hardhat";
import { constants, BigNumber, Contract, Wallet } from "ethers";
import { ONE, deploy } from "../helpers";
import { TestERC20 } from "../../typechain";
import { calculateBuyTokensOut, calculateEthToAdd, calculateSellEthOut, calculateSellTokensIn } from "../../src";
import { signMetaTxRequest } from "../helpers/signMetaTxRequest";
import { relay } from "../helpers/relay";

export function shouldBehaveLikeMarketGSN(): void {
    let expectedTokensOut: BigNumber;
    let expectedEthBalance: BigNumber;

    async function relayFunctionCall(
        wallet: Wallet,
        forwarder: Contract,
        marketContract: Contract,
        methodName: string,
        methodArgs: any[],
    ): Promise<any> {
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
        const response = await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "getTokenId", [
            this.token.address,
        ]);
        const minedResponse = await response.wait();
        expect(minedResponse.status === 1).to.equal(true);
    });

    describe("add initial liquidity", async function () {
        let expectedVirtualEthSupply: BigNumber;

        it.only("reverts adding liquidity if token is not approved", async function () {
            await expect(this.marketGSN.initPool(this.token.address, ONE, ONE)).to.be.revertedWith(
                "ERC20: transfer amount exceeds balance",
            );
        });

        it("reverts if input amount is 0", async function () {
            await expect(this.marketGSN.initPool(this.token.address, 0, ONE)).to.be.revertedWith(
                "DankBankMarket: initial pool amounts must be greater than 0.",
            );
        });

        it("reverts if initial virtual eth supply is 0", async function () {
            await expect(this.marketGSN.initPool(this.token.address, ONE, 0)).to.be.revertedWith(
                "DankBankMarket: initial pool amounts must be greater than 0.",
            );
        });

        it.only("adds liquidity", async function () {
            await this.token.approve(this.marketGSN.address, constants.MaxUint256);

            // await expect(this.marketGSN.initPool(this.token.address, ONE, ONE))
            //     .to.emit(this.marketGSN, "LiquidityAdded")
            //     .withArgs(this.signers.admin.address, this.token.address, ONE, ONE);

            const methodArgs = [this.token.address, ONE, ONE];
            await relayFunctionCall(this.wallet, this.forwarder, this.marketGSN, "initPool", methodArgs);

            expectedVirtualEthSupply = ONE;

            const lpShares = await this.marketGSN.balanceOf(this.signers.admin.address, this.token.address);

            expect(lpShares.toString()).to.equal(ONE.toString());
        });

        it("has the expected virtual eth supply", async function () {
            const virtualEthPoolSupply = await this.marketGSN.virtualEthPoolSupply(this.token.address);

            expect(virtualEthPoolSupply.toString()).to.equal(expectedVirtualEthSupply.toString());
        });

        it("has the expected eth pool supply", async function () {
            const ethPoolSupply = await this.marketGSN.ethPoolSupply(this.token.address);

            expect(ethPoolSupply.toNumber()).to.equal(0);
        });

        it("reverts if pool is already initialized", async function () {
            await expect(this.marketGSN.initPool(this.token.address, ONE, ONE)).to.be.revertedWith(
                "DankBankMarket: pool already initialized",
            );
        });
    });

    describe("add initial liquidity with an initial eth pool supply", function () {
        let otherToken: TestERC20;
        const virtualEthPoolSupply = ONE;
        const ethPoolSupply = ONE;

        it("works", async function () {
            otherToken = await deploy<TestERC20>("TestERC20", { args: [], connect: this.signers.admin });

            await otherToken.mint(this.signers.admin.address, ethers.BigNumber.from(10).pow(18).mul(10000));

            await otherToken.approve(this.marketGSN.address, constants.MaxUint256);

            const expectedLpShares = virtualEthPoolSupply.add(ethPoolSupply);

            await expect(this.marketGSN.initPool(otherToken.address, ONE, ONE, { value: ONE }))
                .to.emit(this.marketGSN, "LiquidityAdded")
                .withArgs(this.signers.admin.address, otherToken.address, ONE, expectedLpShares);

            const lpShares = await this.marketGSN.balanceOf(this.signers.admin.address, otherToken.address);

            expect(lpShares.toString()).to.equal(expectedLpShares.toString());
        });

        it("has the expected virtual eth supply", async function () {
            const virtualEthPoolSupply = await this.marketGSN.virtualEthPoolSupply(otherToken.address);

            expect(virtualEthPoolSupply.toString()).to.equal(virtualEthPoolSupply.toString());
        });

        it("has the expected eth pool supply", async function () {
            const ethPoolSupply = await this.marketGSN.ethPoolSupply(otherToken.address);

            expect(ethPoolSupply.toString()).to.equal(ethPoolSupply.toString());
        });
    });

    describe("buy tokens", function () {
        it("calc buy amount is as expected", async function () {
            const ethIn = ONE;
            expectedEthBalance = ethIn;

            const tokenPool = await this.token.balanceOf(this.marketGSN.address);
            const ethPool = await this.marketGSN.getTotalEthPoolSupply(this.token.address);

            expectedTokensOut = calculateBuyTokensOut(ethIn, ethPool, tokenPool);

            const buyAmount = await this.marketGSN.calculateBuyTokensOut(this.token.address, ethIn);
            expect(buyAmount.toString()).to.equal(expectedTokensOut.toString());
        });

        let tokenBalanceBeforeTrade: BigNumber;

        it("allows buying tokens", async function () {
            const ethIn = ONE;

            const tokenPool = await this.token.balanceOf(this.marketGSN.address);
            const ethPool = await this.marketGSN.getTotalEthPoolSupply(this.token.address);

            expectedTokensOut = calculateBuyTokensOut(ethIn, ethPool, tokenPool);

            tokenBalanceBeforeTrade = await this.token.balanceOf(this.signers.admin.address);

            await expect(
                this.marketGSN.buy(this.token.address, expectedTokensOut, {
                    value: ethIn,
                }),
            )
                .to.emit(this.marketGSN, "DankBankBuy")
                .withArgs(this.signers.admin.address, this.token.address, ethIn, expectedTokensOut);
        });

        it("user token balance is as expected", async function () {
            const tokenBalance = await this.token.balanceOf(this.signers.admin.address);

            expect(tokenBalance.toString()).to.equal(expectedTokensOut.add(tokenBalanceBeforeTrade).toString());
        });

        it("eth pool balance is as expected", async function () {
            const ethPoolBalance = await this.marketGSN.ethPoolSupply(this.token.address);

            expect(ethPoolBalance.toString()).to.equal(expectedEthBalance.toString());
        });

        it("reverts when minTokenOut is not enough", async function () {
            const ethIn = ONE;

            const tokenPool = await this.token.balanceOf(this.marketGSN.address);
            const ethPool = await this.marketGSN.getTotalEthPoolSupply(this.token.address);

            const expectedTokensOut = calculateBuyTokensOut(ethIn, ethPool, tokenPool);

            await expect(
                this.marketGSN.buy(this.token.address, expectedTokensOut.add(1), {
                    value: ethIn,
                }),
            ).to.be.revertedWith("DankBankMarket: Insufficient tokens out.");
        });
    });

    describe("add subsequent liquidity", function () {
        let ratioBefore: BigNumber;

        it("able to add subsequent liquidity", async function () {
            const lpTokenSupply = await this.marketGSN.lpTokenSupply(this.token.address);
            const inputAmount = ONE;
            const poolBalance = await this.token.balanceOf(this.marketGSN.address);

            const expectedMintAmount = inputAmount.mul(lpTokenSupply).div(poolBalance);

            const ethPoolSupply = await this.marketGSN.ethPoolSupply(this.token.address);
            const ethToAdd = calculateEthToAdd(inputAmount, ethPoolSupply, poolBalance);

            ratioBefore = (await this.marketGSN.virtualEthPoolSupply(this.token.address)).div(ethPoolSupply);

            await expect(this.marketGSN.addLiquidity(this.token.address, ONE, ethToAdd, { value: ethToAdd }))
                .to.emit(this.marketGSN, "LiquidityAdded")
                .withArgs(this.signers.admin.address, this.token.address, inputAmount, expectedMintAmount);
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
            const ethToAdd = calculateEthToAdd(inputAmount, ethPoolSupply, poolBalance);

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
            tokensIn = expectedTokensOut.div(2);

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
            const tokensIn = expectedTokensOut.div(2);
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
            const tokensIn = expectedTokensOut.div(Math.floor(Math.random() * MAX) + MIN);
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

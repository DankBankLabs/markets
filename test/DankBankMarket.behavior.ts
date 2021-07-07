import { expect } from "chai";
import { ONE } from "./helpers";

export function shouldBehaveLikeMarket(): void {
    it("reverts adding liquidity if token is not approved", async function () {
        await expect(this.market.addLiquidity(
            this.token.address,
            ONE,
            ONE,
            ONE
        )).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
}

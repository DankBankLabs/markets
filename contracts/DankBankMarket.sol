// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./DankBankMarketData.sol";
import "./ERC1155LPTokenUpgradeable.sol";
import "./IERC20.sol";
import "./OpenZeppelin/Initializable.sol";

contract DankBankMarket is DankBankMarketData, Initializable, ERC1155LPTokenUpgradeable {
    function init(string memory uri) public initializer {
        __ERC1155_init(uri);
    }

    // initVirtualEth ignored if not creating the pool from scratch
    function addLiquidity(
        address token,
        uint256 inputAmount,
        uint256 minOutputShares,
        uint256 initVirtualEthSupply
    ) external {
        IERC20(token).transferFrom(_msgSender(), address(this), inputAmount);

        uint256 tokenId = getTokenId(token);

        if (virtualEthPoolSupply[token] == 0) {
            // initial funding
            _mint(_msgSender(), tokenId, initVirtualEthSupply, "");
            virtualEthPoolSupply[token] = initVirtualEthSupply;

            emit LiquidityAdded(_msgSender(), token, inputAmount, initVirtualEthSupply);
        } else {
            uint256 prevPoolBalance = IERC20(token).balanceOf(address(this)) - inputAmount;

            uint256 ethAdded = (inputAmount * getTotalEthPoolSupply(token)) / prevPoolBalance;
            virtualEthPoolSupply[token] += ethAdded;

            uint256 mintAmount = (inputAmount * lpTokenSupply(tokenId)) / prevPoolBalance;
            require(mintAmount >= minOutputShares, "DankBankMarket: output shares less than required.");
            _mint(_msgSender(), tokenId, mintAmount, "");

            emit LiquidityAdded(_msgSender(), token, inputAmount, mintAmount);
        }
    }

    function removeLiquidity(address token, uint256 burnAmount) external {
        uint256 tokenId = getTokenId(token);

        uint256 ethRemoved = (burnAmount * ethPoolSupply[token]) / lpTokenSupply(tokenId);
        ethPoolSupply[token] -= ethRemoved;

        virtualEthPoolSupply[token] -= (burnAmount * virtualEthPoolSupply[token]) / lpTokenSupply(tokenId);

        uint256 tokensRemoved = (burnAmount * IERC20(token).balanceOf(address(this))) / lpTokenSupply(tokenId);

        // burn will revert if burn amount exceeds balance
        _burn(_msgSender(), tokenId, burnAmount);

        // XXX: _burn must by attempted before transfers to prevent reentrancy
        IERC20(token).transfer(_msgSender(), tokensRemoved);

        (bool success, ) = msg.sender.call{ value: ethRemoved }("");
        require(success, "DankBankMarket: Transfer failed.");

        emit LiquidityRemoved(_msgSender(), token, tokensRemoved, ethRemoved, burnAmount);
    }

    function buy(address token, uint256 minTokensOut) external payable {
        uint256 tokensOut = calculateBuyAmount(token, msg.value);

        ethPoolSupply[token] += msg.value;

        require(tokensOut >= minTokensOut, "DankBankMarket: Insufficient tokens out.");
        IERC20(token).transfer(_msgSender(), tokensOut);

        emit DankBankBuy(_msgSender(), token, msg.value, tokensOut);
    }

    function sell(
        address token,
        uint256 tokensIn,
        uint256 minEthOut
    ) external {
        uint256 ethOut = calculateSellAmount(token, tokensIn);

        require(ethOut >= minEthOut, "DankBankMarket: Insufficient eth out.");

        // will revert on underflow so there's no way to take out more than the actually eth supply
        ethPoolSupply[token] -= ethOut;

        IERC20(token).transferFrom(_msgSender(), address(this), tokensIn);

        (bool success, ) = msg.sender.call{ value: ethOut }("");
        require(success, "DankBankMarket: Transfer failed.");

        emit DankBankSell(_msgSender(), token, ethOut, tokensIn);
    }

    function calculateBuyAmount(address token, uint256 ethIn) public view returns (uint256 tokensOut) {
        uint256 fee = ethIn / FEE_DIVISOR;
        uint256 tokenPool = IERC20(token).balanceOf(address(this));
        uint256 ethSupply = getTotalEthPoolSupply(token);

        uint256 invariant = ethSupply * tokenPool;

        uint256 newTokenPool = invariant / ((ethSupply + ethIn) - fee);
        tokensOut = tokenPool - newTokenPool;
    }

    function calculateSellAmount(address token, uint256 tokensIn) public view returns (uint256 ethOut) {
        uint256 fee = tokensIn / FEE_DIVISOR;

        uint256 tokenPool = IERC20(token).balanceOf(address(this));
        uint256 ethPool = getTotalEthPoolSupply(token);
        uint256 invariant = ethPool * tokenPool;

        uint256 newTokenPool = tokenPool + tokensIn;
        uint256 newEthPool = invariant / (newTokenPool - fee);
        ethOut = ethPool - newEthPool;
    }

    function getTotalEthPoolSupply(address token) public view returns (uint256) {
        return virtualEthPoolSupply[token] + ethPoolSupply[token];
    }

    function getTokenId(address token) public pure returns (uint256) {
        return uint256(uint160(token));
    }
}

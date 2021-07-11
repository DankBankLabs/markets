// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./DankBankMarketData.sol";
import "./ERC1155LPTokenUpgradeable.sol";
import "./IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract DankBankMarket is DankBankMarketData, Initializable, ERC1155LPTokenUpgradeable {
    uint256 public constant FEE_MULTIPLIER = 500; // 0.2% fee on trades
    uint256 public constant MULTIPLIER_SUB_ONE = FEE_MULTIPLIER - 1;

    function init(string memory uri) public initializer {
        __ERC1155_init(uri);
    }

    function initPool(address token, uint256 inputAmount, uint256 initVirtualEthSupply) external {
        require(virtualEthPoolSupply[token] == 0, "DankBankMarket: pool already initialized");

        IERC20(token).transferFrom(_msgSender(), address(this), inputAmount);

        uint256 tokenId = getTokenId(token);

        _mint(_msgSender(), tokenId, initVirtualEthSupply, "");
        virtualEthPoolSupply[token] = initVirtualEthSupply;

        emit LiquidityAdded(_msgSender(), token, inputAmount, initVirtualEthSupply);
    }

    // initVirtualEth ignored if not creating the pool from scratch
    function addLiquidity(
        address token,
        uint256 inputAmount
    ) external payable {
        require(virtualEthPoolSupply[token] > 0, "DankBankMarket: pool must be initialized before adding liquidity");

        IERC20(token).transferFrom(_msgSender(), address(this), inputAmount);

        uint256 tokenId = getTokenId(token);

        uint256 prevPoolBalance = IERC20(token).balanceOf(address(this)) - inputAmount;

        uint256 ethAdded = (inputAmount * ethPoolSupply[token]) / prevPoolBalance;
        require(msg.value >= ethAdded, "DankBankMarket: insufficient ETH supplied.");
        ethPoolSupply[token] += ethAdded;

        uint256 virtualEthAdded = (inputAmount * virtualEthPoolSupply[token]) / prevPoolBalance;
        virtualEthPoolSupply[token] += virtualEthAdded;

        uint256 mintAmount = (inputAmount * lpTokenSupply(tokenId)) / prevPoolBalance;
        _mint(_msgSender(), tokenId, mintAmount, "");

        // refund dust eth if any
        if (msg.value > ethAdded) {
            (bool success, ) = msg.sender.call{ value: msg.value - ethAdded }("");
            require(success, "DankBankMarket: Transfer failed.");
        }

        emit LiquidityAdded(_msgSender(), token, inputAmount, mintAmount);
    }

    function removeLiquidity(address token, uint256 burnAmount) external {
        uint256 tokenId = getTokenId(token);
        uint256 lpSupply = lpTokenSupply(tokenId);

        uint256 ethRemoved = (burnAmount * ethPoolSupply[token]) / lpSupply;
        ethPoolSupply[token] -= ethRemoved;

        virtualEthPoolSupply[token] -= (burnAmount * virtualEthPoolSupply[token]) / lpSupply;

        uint256 tokensRemoved = (burnAmount * IERC20(token).balanceOf(address(this))) / lpSupply;

        // burn will revert if burn amount exceeds balance
        _burn(_msgSender(), tokenId, burnAmount);

        // XXX: _burn must by attempted before transfers to prevent reentrancy
        IERC20(token).transfer(_msgSender(), tokensRemoved);

        (bool success, ) = msg.sender.call{ value: ethRemoved }("");
        require(success, "DankBankMarket: Transfer failed.");

        emit LiquidityRemoved(_msgSender(), token, tokensRemoved, ethRemoved, burnAmount);
    }

    function buy(address token, uint256 minTokensOut) external payable {
        uint256 tokensOut = calculateBuyTokensOut(token, msg.value);

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
        uint256 ethOut = calculateSellEthOut(token, tokensIn);

        require(ethOut >= minEthOut, "DankBankMarket: Insufficient eth out.");

        // will revert on underflow so there's no way to take out more than the actually eth supply of this token
        ethPoolSupply[token] -= ethOut;

        IERC20(token).transferFrom(_msgSender(), address(this), tokensIn);

        (bool success, ) = msg.sender.call{ value: ethOut }("");
        require(success, "DankBankMarket: Transfer failed.");

        emit DankBankSell(_msgSender(), token, ethOut, tokensIn);
    }

    function calculateBuyTokensOut(address token, uint256 ethIn) public view returns (uint256 tokensOut) {
        /**
        Logic below is a simplified version of:

        uint256 fee = ethIn / FEE_MULTIPLIER;

        uint256 ethSupply = getTotalEthPoolSupply(token);

        uint256 invariant = ethSupply * tokenPool;

        uint256 newTokenPool = invariant / ((ethSupply + ethIn) - fee);
        tokensOut = tokenPool - newTokenPool;
        */

        uint256 scaledTokenPool = IERC20(token).balanceOf(address(this)) * MULTIPLIER_SUB_ONE;
        uint256 scaledEthPool = getTotalEthPoolSupply(token) * FEE_MULTIPLIER;

        tokensOut = (scaledTokenPool * ethIn) / (scaledEthPool + MULTIPLIER_SUB_ONE * ethIn);
    }

    function calculateSellEthOut(address token, uint256 tokensIn) public view returns (uint256 ethOut) {
        /**
        Logic below is a simplified version of:

        uint256 fee = tokensIn / FEE_MULTIPLIER;

        uint256 tokenPool = IERC20(token).balanceOf(address(this));
        uint256 ethPool = getTotalEthPoolSupply(token);
        uint256 invariant = ethPool * tokenPool;

        uint256 newEthPool = invariant / ((tokenPool + tokensIn) - fee);
        ethOut = ethPool - newEthPool;
        */

        uint256 scaledEthPool = getTotalEthPoolSupply(token) * MULTIPLIER_SUB_ONE;
        uint256 scaledTokenPool = IERC20(token).balanceOf(address(this)) * FEE_MULTIPLIER;

        ethOut = (scaledEthPool * tokensIn) / (scaledTokenPool + MULTIPLIER_SUB_ONE * tokensIn);
    }

    function getTotalEthPoolSupply(address token) public view returns (uint256) {
        return virtualEthPoolSupply[token] + ethPoolSupply[token];
    }

    function getTokenId(address token) public pure returns (uint256) {
        return uint256(uint160(token));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./DankBankMarketGSNData.sol";
import "./ERC1155LPTokenUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract DankBankMarketGSN is
    DankBankMarketData,
    Initializable,
    ERC2771ContextUpgradeable,
    ERC1155LPTokenUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 public constant FEE_MULTIPLIER = 500; // 0.2% fee on trades
    uint256 public constant MULTIPLIER_SUB_ONE = FEE_MULTIPLIER - 1;

    // TODO: ideally the constructor makes the implementation contract unusable
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {
        __ERC1155_init("uri for initializing the implementation contract");
    }

    function init(
        string memory uri,
        address trustedForwarder,
        address paymentTokenAddress
    ) public initializer {
        __ERC2771Context_init(trustedForwarder);
        __ERC1155_init(uri);
        paymentToken = paymentTokenAddress;
    }

    function initPool(
        address memeToken,
        uint256 memeTokenInputAmount,
        uint256 paymentTokenInputAmount,
        uint256 initVirtualTokenSupply
    ) external nonReentrant {
        require(virtualTokenPoolSupply[memeToken] == 0, "DankBankMarket: pool already initialized");
        require(
            memeTokenInputAmount > 0 && initVirtualTokenSupply > 0,
            "DankBankMarket: initial pool amounts must be greater than 0."
        );

        IERC20Upgradeable(memeToken).safeTransferFrom(_msgSender(), address(this), memeTokenInputAmount);
        if (paymentTokenInputAmount > 0) {
            IERC20Upgradeable(paymentToken).safeTransferFrom(_msgSender(), address(this), paymentTokenInputAmount);
        }

        uint256 tokenId = getTokenId(memeToken);

        tokenPoolSupply[memeToken] += paymentTokenInputAmount;
        virtualTokenPoolSupply[memeToken] = initVirtualTokenSupply;

        uint256 sharesMinted = initVirtualTokenSupply + paymentTokenInputAmount;
        _mint(_msgSender(), tokenId, sharesMinted, "");

        emit LiquidityAdded(_msgSender(), memeToken, memeTokenInputAmount, sharesMinted);
    }

    function addLiquidity(
        address memeToken,
        uint256 memeTokenInputAmount,
        uint256 paymentTokenInputAmount,
        uint256 minPaymentTokensAdded
    ) external nonReentrant {
        require(
            virtualTokenPoolSupply[memeToken] > 0,
            "DankBankMarket: pool must be initialized before adding liquidity"
        );

        IERC20Upgradeable(memeToken).safeTransferFrom(_msgSender(), address(this), memeTokenInputAmount);
        IERC20Upgradeable(paymentToken).safeTransferFrom(_msgSender(), address(this), paymentTokenInputAmount);

        uint256 tokenId = getTokenId(memeToken);

        uint256 prevPoolBalance = IERC20Upgradeable(memeToken).balanceOf(address(this)) - memeTokenInputAmount;

        uint256 paymentTokensAdded = (memeTokenInputAmount * tokenPoolSupply[memeToken]) / prevPoolBalance;

        // ensure adding liquidity in specific price range
        require(paymentTokenInputAmount >= paymentTokensAdded, "DankBankMarket: insufficient payment token supplied.");
        require(
            paymentTokensAdded >= minPaymentTokensAdded,
            "DankBankMarket: Payment token supplied less than minimum required."
        );

        tokenPoolSupply[memeToken] += paymentTokensAdded;

        uint256 virtualTokensAdded = (memeTokenInputAmount * virtualTokenPoolSupply[memeToken]) / prevPoolBalance;
        virtualTokenPoolSupply[memeToken] += virtualTokensAdded;

        uint256 mintAmount = (memeTokenInputAmount * lpTokenSupply(tokenId)) / prevPoolBalance;
        _mint(_msgSender(), tokenId, mintAmount, "");

        // refund dust eth if any
        if (paymentTokenInputAmount > paymentTokensAdded) {
            IERC20Upgradeable(paymentToken).safeTransferFrom(address(this), _msgSender(), memeTokenInputAmount);
        }

        emit LiquidityAdded(_msgSender(), memeToken, memeTokenInputAmount, mintAmount);
    }

    function removeLiquidity(
        address memeToken,
        uint256 burnAmount,
        uint256 minMemeTokens,
        uint256 minPaymentTokens
    ) external nonReentrant {
        uint256 tokenId = getTokenId(memeToken);
        uint256 lpSupply = lpTokenSupply(tokenId);

        uint256 paymentTokensRemoved = (burnAmount * tokenPoolSupply[memeToken]) / lpSupply;
        tokenPoolSupply[memeToken] -= paymentTokensRemoved;
        require(
            paymentTokensRemoved >= minPaymentTokens,
            "DankBankMarket: Payment tokens out is less than minimum tokens specified"
        );

        virtualTokenPoolSupply[memeToken] -= (burnAmount * virtualTokenPoolSupply[memeToken]) / lpSupply;

        uint256 memeTokensRemoved = (burnAmount * IERC20Upgradeable(memeToken).balanceOf(address(this))) / lpSupply;
        require(memeTokensRemoved >= minMemeTokens, "DankBankMarket: Meme token out is less than minimum specified");

        // burn will revert if burn amount exceeds balance
        _burn(_msgSender(), tokenId, burnAmount);

        // XXX: _burn must by attempted before transfers to prevent reentrancy
        IERC20Upgradeable(memeToken).safeTransfer(_msgSender(), memeTokensRemoved);
        IERC20Upgradeable(paymentToken).safeTransfer(_msgSender(), paymentTokensRemoved);

        emit LiquidityRemoved(_msgSender(), memeToken, memeTokensRemoved, paymentTokensRemoved, burnAmount);
    }

    function buy(
        address memeToken,
        uint256 paymentTokensAmount,
        uint256 minMemeTokensOut
    ) external nonReentrant {
        uint256 memeTokensOut = calculateBuyTokensOut(memeToken, paymentTokensAmount);

        tokenPoolSupply[memeToken] += paymentTokensAmount;

        require(memeTokensOut >= minMemeTokensOut, "DankBankMarket: Insufficient meme tokens out.");
        IERC20Upgradeable(memeToken).safeTransfer(_msgSender(), memeTokensOut);
        IERC20Upgradeable(paymentToken).safeTransferFrom(_msgSender(), address(this), paymentTokensAmount);

        emit DankBankBuy(_msgSender(), memeToken, paymentTokensAmount, memeTokensOut);
    }

    function sell(
        address memeToken,
        uint256 memeTokensIn,
        uint256 minPaymentTokensOut
    ) external nonReentrant {
        uint256 paymentTokensOut = calculateSellPaymentTokenOut(memeToken, memeTokensIn);

        require(paymentTokensOut >= minPaymentTokensOut, "DankBankMarket: Insufficient payment tokens out.");
        require(
            tokenPoolSupply[memeToken] >= paymentTokensOut,
            "DankBankMarket: Market has insufficient liquidity for the trade."
        );
        unchecked {
            tokenPoolSupply[memeToken] -= paymentTokensOut;
        }

        IERC20Upgradeable(memeToken).safeTransferFrom(_msgSender(), address(this), memeTokensIn);
        IERC20Upgradeable(paymentToken).safeTransfer(_msgSender(), paymentTokensOut);

        emit DankBankSell(_msgSender(), memeToken, paymentTokensOut, memeTokensIn);
    }

    function calculateBuyTokensOut(address memeToken, uint256 paymentTokensAmount)
        public
        view
        returns (uint256 memeTokensOut)
    {
        /**
        Logic below is a simplified version of:

        uint256 fee = ethIn / FEE_MULTIPLIER;

        uint256 ethSupply = getTotalTokenPoolSupply(token);

        uint256 invariant = ethSupply * tokenPool;

        uint256 newTokenPool = invariant / ((ethSupply + ethIn) - fee);
        tokensOut = tokenPool - newTokenPool;
        */

        uint256 scaledMemeTokenPool = IERC20Upgradeable(memeToken).balanceOf(address(this)) * MULTIPLIER_SUB_ONE;
        uint256 scaledPaymentTokenPool = getTotalTokenPoolSupply(memeToken) * FEE_MULTIPLIER;

        memeTokensOut =
            (scaledMemeTokenPool * paymentTokensAmount) /
            (scaledPaymentTokenPool + MULTIPLIER_SUB_ONE * paymentTokensAmount);
    }

    function calculateSellPaymentTokenOut(address memeToken, uint256 memeTokensIn)
        public
        view
        returns (uint256 paymentTokensOut)
    {
        /**
        Logic below is a simplified version of:

        uint256 fee = tokensIn / FEE_MULTIPLIER;

        uint256 tokenPool = IERC20Upgradeable(token).balanceOf(address(this));
        uint256 ethPool = getTotalTokenPoolSupply(token);
        uint256 invariant = ethPool * tokenPool;

        uint256 newEthPool = invariant / ((tokenPool + tokensIn) - fee);
        ethOut = ethPool - newEthPool;
        */

        uint256 scaledPaymentTokenPool = getTotalTokenPoolSupply(memeToken) * MULTIPLIER_SUB_ONE;
        uint256 scaledMemeTokenPool = IERC20Upgradeable(memeToken).balanceOf(address(this)) * FEE_MULTIPLIER;

        paymentTokensOut =
            (scaledPaymentTokenPool * memeTokensIn) /
            (scaledMemeTokenPool + MULTIPLIER_SUB_ONE * memeTokensIn);
    }

    function getTotalTokenPoolSupply(address memeToken) public view returns (uint256) {
        return virtualTokenPoolSupply[memeToken] + tokenPoolSupply[memeToken];
    }

    function getTokenId(address token) public pure returns (uint256) {
        return uint256(uint160(token));
    }

    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (address sender)
    {
        return ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (bytes memory) {
        return ERC2771ContextUpgradeable._msgData();
    }
}

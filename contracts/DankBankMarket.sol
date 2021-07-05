// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./ERC1155TokenSupplyUpgradeable.sol";
import "./IERC20.sol";
import "./OpenZeppelin/Initializable.sol";

contract DankBankMarket is Initializable, ERC1155TokenSupplyUpgradeable {
    mapping(address => uint256) public virtualEthPoolSupply;
    mapping(address => uint256) public ethPoolSupply;

    uint256 public constant FEE_DIVISOR = 500; // 0.2% fee on trades

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
        require(
            IERC20(token).transferFrom(_msgSender(), address(this), inputAmount),
            "DankBankMarket: token transfer unsuccessful"
        );

        uint256 tokenId = _getTokenId(token);

        if (virtualEthPoolSupply[token] == 0) {
            // initial funding
            _mint(_msgSender(), tokenId, initVirtualEthSupply, "");
            virtualEthPoolSupply[token] = initVirtualEthSupply;
        } else {
            uint256 prevPoolBalance = IERC20(token).balanceOf(address(this)) - inputAmount;

            uint256 ethAdded = (inputAmount * _getTotalEthPoolSupply(token)) / prevPoolBalance;
            virtualEthPoolSupply[token] += ethAdded;

            uint256 mintAmount = (inputAmount * tokenSupplies(tokenId)) / prevPoolBalance;
            require(mintAmount >= minOutputShares, "DankBankMarket: output shares less than required.");
            _mint(_msgSender(), tokenId, mintAmount, "");
        }
    }

    function removeLiquidity(address token, uint256 burnAmount) external {
        uint256 tokenId = _getTokenId(token);

        uint256 ethRemoved = (burnAmount * ethPoolSupply[token]) / tokenSupplies(tokenId);
        ethPoolSupply[token] -= ethRemoved;

        virtualEthPoolSupply[token] -= (burnAmount * virtualEthPoolSupply[token]) / tokenSupplies(tokenId);

        uint256 tokensRemoved = (burnAmount * IERC20(token).balanceOf(address(this))) / tokenSupplies(tokenId);

        // burn will revert if burn amount exceeds balance
        _burn(_msgSender(), tokenId, burnAmount);

        // XXX: _burn must by attempted before transfers to prevent reentrancy
        IERC20(token).transfer(_msgSender(), tokensRemoved);

        (bool success, ) = msg.sender.call{ value: ethRemoved }("");
        require(success, "DankBankMarket: Transfer failed.");
    }

    function buy(address token, uint256 minTokensOut) external payable {
        uint256 tokensOut = calculateBuyAmount(token, msg.value);

        ethPoolSupply[token] += msg.value;

        require(tokensOut >= minTokensOut, "DankBankMarket: Insufficient tokens out.");
        IERC20(token).transfer(_msgSender(), tokensOut);
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
    }

    function calculateBuyAmount(address token, uint256 ethAmount) public view returns (uint256 tokensOut) {
        uint256 fee = ethAmount / FEE_DIVISOR;
        uint256 tokenPool = IERC20(token).balanceOf(address(this));
        uint256 ethSupply = _getTotalEthPoolSupply(token);

        uint256 invariant = ethSupply * tokenPool;

        uint256 newTokenPool = invariant / ((ethSupply + ethAmount) - fee);
        tokensOut = tokenPool - newTokenPool;
    }

    function calculateSellAmount(address token, uint256 tokensIn) public view returns (uint256 ethOut) {
        uint256 fee = tokensIn / FEE_DIVISOR;

        uint256 tokenPool = IERC20(token).balanceOf(address(this));
        uint256 ethPool = _getTotalEthPoolSupply(token);
        uint256 invariant = ethPool * tokenPool;

        uint256 newTokenPool = tokenPool + tokensIn;
        uint256 newEthPool = invariant / (newTokenPool - fee);
        ethOut = ethPool - newEthPool;
    }

    function _getTotalEthPoolSupply(address token) internal view returns (uint256) {
        return virtualEthPoolSupply[token] + ethPoolSupply[token];
    }

    function _getTokenId(address token) internal pure returns (uint256) {
        return uint256(uint160(token));
    }
}

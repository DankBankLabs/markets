// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

contract DankBankMarketData {
    mapping(address => uint256) public virtualTokenPoolSupply;
    mapping(address => uint256) public tokenPoolSupply;
    address public paymentToken;

    event LiquidityAdded(
        address indexed funder,
        address memeToken,
        uint256 memeTokensAdded,
        uint256 paymentTokensAdded,
        uint256 sharesMinted
    );

    event LiquidityRemoved(
        address indexed funder,
        address memeToken,
        uint256 memeTokensRemoved,
        uint256 paymentTokensRemoved,
        uint256 sharesBurnt
    );

    event DankBankBuy(address indexed buyer, address memeToken, uint256 investmentAmount, uint256 tokensBought);

    event DankBankSell(address indexed seller, address memeToken, uint256 returnAmount, uint256 tokensSold);
}

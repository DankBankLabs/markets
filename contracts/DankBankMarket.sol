// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./ERC1155TokenSupplyUpgradeable.sol";
import "./IERC20.sol";
import "./OpenZeppelin/Initializable.sol";

contract DankBankMarket is Initializable, ERC1155TokenSupplyUpgradeable {
    mapping(address => uint256) public virtualEthPoolSupply;
    mapping(address => uint256) public ethPoolSupply;

    function init(string memory uri) public initializer {
        __ERC1155_init(uri);
    }

    // initVirtualEth ignored if not creating the pool from scratch
    function addLiquidity(
        IERC20 token,
        uint256 inputAmount,
        uint256 minOutputShares,
        uint256 initVirtualEthSupply
    ) external {
        require(
            token.transferFrom(_msgSender(), address(this), inputAmount),
            "DankBankMarket: token transfer unsuccessful"
        );

        if (virtualEthPoolSupply[token] == 0) {
            // initial funding
            _mint(_msgSender(), uint256(token), initVirtualEthSupply);
            virtualEthPoolSupply[token] = initVirtualEthSupply;
        } else {
            uint256 prevPoolBalance = token.balanceOf(address(this)) - inputAmount;

            uint256 ethAdded = (inputAmount * _getTotalEthPoolSupply(token)) / prevPoolBalance;
            virtualEthPoolSupply[token] += ethAdded;

            uint256 mintAmount = (inputAmount * tokenSupplies(uint256(token))) / prevPoolBalance;
            require(mintAmount >= minOutputShares, "DankBankMarket: output shares less than required.");
            _mint(_msgSender(), uint256(token), mintAmount);
        }
    }

    function removeLiquidity(IERC20 token, uint256 burnAmount) external {
        uint256 ethRemoved = (burnAmount * ethPoolSupply[token]) / tokenSupplies(uint256(token));
        ethPoolSupply[token] -= ethRemoved;

        virtualEthPoolSupply[token] -= (burnAmount * virtualEthPoolSupply[token]) / tokenSupplies(uint256(token));

        _burn(_msgSender(), uint256(token), burnAmount);

        // XXX: _burn must by attempted before transfer to prevent reentrancy
        (bool success, ) = msg.sender.call.value(ethRemoved)("");
        require(success, "DankBankMarket: Transfer failed.");
    }

    function buy(address token) external payable {}

    function _getTotalEthPoolSupply(address token) internal returns (uint256) {
        return virtualEthPoolSupply[token] + ethPoolSupply[token];
    }
}

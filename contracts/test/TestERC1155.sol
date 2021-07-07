// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../ERC1155TokenSupplyUpgradeable.sol";

contract TestERC1155 is ERC1155TokenSupplyUpgradeable {
    constructor() {
        __ERC1155_init("irrelevant token uri");
    }

    function mint(
        address account,
        uint256 id,
        uint256 amount
    ) external {
        _mint(account, id, amount, "");
    }

    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts
    ) external {
        _mintBatch(to, ids, amounts, "");
    }

    function burn(
        address account,
        uint256 id,
        uint256 amount
    ) external {
        _burn(account, id, amount);
    }

    function burnBatch(
        address account,
        uint256[] memory ids,
        uint256[] memory amounts
    ) external {
        _burnBatch(account, ids, amounts);
    }
}

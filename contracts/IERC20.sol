// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

interface IERC20 {
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    function balanceOf(address account) external returns (uint256);
}

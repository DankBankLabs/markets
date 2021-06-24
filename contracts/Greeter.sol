// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract Greeter is Initializable {
    string public greeting;

    bool public paused;

    function init(string memory _greeting) public initializer {
        greeting = _greeting;
    }

    function greet() public view returns (string memory) {
        return greeting;
    }

    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }
}

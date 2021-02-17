/*
    Copyright 2020 Dynamic Dollar Devs, based on the works of the Empty Set Squad

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

pragma solidity ^0.5.17;
pragma experimental ABIEncoderV2;

import "../external/Decimal.sol";
import "../dao/Market.sol";
import "./MockComptroller.sol";

contract MockMarket is MockComptroller, Market {
    constructor(address pool) public MockComptroller(pool) {}

    function stepE() external {
        Market.step();
    }

    function setPriceE(uint256 numerator, uint256 denominator) external {
        _state13.price = Decimal.ratio(numerator, denominator);
    }

    function justMintCDSDToE(address account, uint256 amount) external {
        cdsd().mint(account, amount);
    }

    function mintCDSDAndIncreaseDSDBurnedE(address account, uint256 amount) external {
        cdsd().mint(account, amount);
        // emulate burning of DSD for CDSD
        super.incrementBalanceOfBurnedDSD(account, amount);
    }
}

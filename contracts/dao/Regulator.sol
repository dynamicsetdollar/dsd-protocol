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

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./Comptroller.sol";
import "../external/Decimal.sol";
import "../Constants.sol";

contract Regulator is Comptroller {
    using SafeMath for uint256;
    using Decimal for Decimal.D256;

    event SupplyIncrease(uint256 indexed epoch, uint256 price, uint256 newRedeemable, uint256 newBonded);
    event ContractionIncentives(uint256 indexed epoch, uint256 price, uint256 delta);
    event SupplyNeutral(uint256 indexed epoch);

    function step() internal {
        (Decimal.D256 memory price, Decimal.D256 memory CDSDPrice) = oracleCapture();

        setPrices(price, CDSDPrice);

        if (price.greaterThan(Decimal.one())) {
            expansion(price);
            return;
        }

        if (price.lessThan(Decimal.one())) {
            contraction(price);
            return;
        }

        emit SupplyNeutral(epoch());
    }

    function expansion(Decimal.D256 memory price) private {
        Decimal.D256 memory delta = 
            limit(price.sub(Decimal.one()).div(Constants.getSupplyChangeDivisor()), price);
            
        uint256 newSupply = delta.mul(dollar().totalSupply()).asUint256();
        (uint256 newRedeemable, uint256 newBonded) = increaseSupply(newSupply);

        emit SupplyIncrease(epoch(), price.value, newRedeemable, newBonded);
    }

    function contraction(Decimal.D256 memory price) private {
        (uint256 newDSDSupply) = contractionIncentives(price);

        emit ContractionIncentives(epoch(), price.value, newDSDSupply);
    }

    function limit(Decimal.D256 memory delta, Decimal.D256 memory price) private view returns (Decimal.D256 memory) {
        Decimal.D256 memory supplyChangeLimit = Constants.getSupplyChangeLimit();

        return delta.greaterThan(supplyChangeLimit) ? supplyChangeLimit : delta;
    }

    function oracleCapture() private returns (Decimal.D256 memory, Decimal.D256 memory) {
        (Decimal.D256 memory price, bool valid) = oracle().capture();
        
        if (bootstrappingAt(epoch().sub(1))) {
            price = Constants.getBootstrappingPrice();
        }
        if (!valid) {
            price = Decimal.one();
        }

        (Decimal.D256 memory CDSDPrice, bool contractionValid) = contractionOracle().capture();
        if (!contractionValid) {
            CDSDPrice = price;
        }

        return (price, CDSDPrice);
    }
}

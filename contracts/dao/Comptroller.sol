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
import "./Setters.sol";
import "../external/Require.sol";
import "../Constants.sol";

contract Comptroller is Setters {
    using SafeMath for uint256;

    bytes32 private constant FILE = "Comptroller";

    function setPrices(Decimal.D256 memory price, Decimal.D256 memory CDSDPrice) internal {
        _state13.price = price;
        _state17.CDSDPrice = CDSDPrice;

        // track expansion cycles
        if (price.greaterThan(Decimal.one())) {
            if (_state10.expansionStartEpoch == 0) {
                _state10.expansionStartEpoch = epoch();
            }
        } else {
            _state10.expansionStartEpoch = 0;
        }
    }

    function mintToAccount(address account, uint256 amount) internal {
        dollar().mint(account, amount);

        balanceCheck();
    }

    function burnFromAccount(address account, uint256 amount) internal {
        dollar().transferFrom(account, address(this), amount);
        dollar().burn(amount);

        balanceCheck();
    }

    function burnRedeemable(uint256 amount) internal {
        dollar().burn(amount);
        decrementTotalRedeemable(amount, "Comptroller: not enough redeemable balance");

        balanceCheck();
    }

    function contractionIncentives(Decimal.D256 memory price) internal returns (uint256) {
        // clear outstanding redeemables
        uint256 redeemable = totalCDSDRedeemable();
        if (redeemable != 0) {
            clearCDSDRedeemable();
        }

        // accrue interest on CDSD
        uint256 currentMultiplier = globalInterestMultiplier();
        Decimal.D256 memory interest = Constants.maxCDSDBondingRewards();

        uint256 newMultiplier = Decimal.D256({ value: currentMultiplier }).mul(Decimal.one().add(interest)).value;
        setGlobalInterestMultiplier(newMultiplier);

        // payout CPool rewards
        Decimal.D256 memory cPoolReward =
            Decimal.D256({ value: cdsd().totalSupply() }).mul(Constants.getContractionPoolTargetSupply()).mul(
                Constants.getContractionPoolTargetReward()
            );
        cdsd().mint(Constants.getContractionPoolAddress(), cPoolReward.value);

        // DSD bonded in the DAO receives a fixed APY
        uint256 daoBondingRewards;
        if (totalBonded() != 0) {
            daoBondingRewards = Decimal.D256(totalBonded()).mul(Constants.getContractionBondingRewards()).value;
            mintToDAO(daoBondingRewards);
        }

        balanceCheck();

        return daoBondingRewards;
    }

    function increaseSupply(uint256 newSupply) internal returns (uint256, uint256) {
        // 0-a. Pay out to Pool
        uint256 poolReward = newSupply.mul(Constants.getOraclePoolRatio()).div(100);
        mintToPool(poolReward);

        // 0-b. Pay out to Treasury
        uint256 treasuryReward = newSupply.mul(Constants.getTreasuryRatio()).div(100);
        mintToTreasury(treasuryReward);

        // cDSD redemption logic
        uint256 newCDSDRedeemable = 0;
        uint256 outstanding = maxCDSDOutstanding();
        uint256 redeemable = totalCDSDRedeemable().sub(totalCDSDRedeemed());
        if (redeemable < outstanding) {
            uint256 newRedeemable = newSupply.mul(Constants.getCDSDRedemptionRatio()).div(100);
            uint256 newRedeemableCap = outstanding.sub(redeemable);

            newCDSDRedeemable = newRedeemableCap > newRedeemable ? newRedeemableCap : newRedeemable;

            incrementTotalCDSDRedeemable(newCDSDRedeemable);
        }

        // remaining is for DAO
        uint256 rewards = poolReward.add(treasuryReward).add(newCDSDRedeemable);
        uint256 amount = newSupply > rewards ? newSupply.sub(rewards) : 0;

        // 2. Payout to DAO
        if (totalBonded() == 0) {
            amount = 0;
        }
        if (amount > 0) {
            mintToDAO(amount);
        }

        balanceCheck();

        return (newCDSDRedeemable, amount.add(rewards));
    }

    function balanceCheck() internal view {
        Require.that(
            dollar().balanceOf(address(this)) >= totalBonded().add(totalStaged()).add(totalRedeemable()),
            FILE,
            "Inconsistent balances"
        );
    }

    function mintToDAO(uint256 amount) private {
        if (amount > 0) {
            dollar().mint(address(this), amount);
            incrementTotalBonded(amount);
        }
    }

    function mintToTreasury(uint256 amount) private {
        if (amount > 0) {
            dollar().mint(Constants.getTreasuryAddress(), amount);
        }
    }

    function mintToPool(uint256 amount) private {
        if (amount > 0) {
            dollar().mint(pool(), amount);
        }
    }
}

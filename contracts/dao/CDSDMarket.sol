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
import "../Constants.sol";

contract CDSDMarket is Comptroller {
    using SafeMath for uint256;

    event CDSDMinted(address indexed account, uint256 amount);
    event CDSDRedeemed(address indexed account, uint256 amount);
    event BondCDSD(address indexed account, uint256 start, uint256 amount);
    event UnbondCDSD(address indexed account, uint256 start, uint256 amount);

    function burnDSDForCDSD(uint256 amount) public {
        require(_state13.price.lessThan(Decimal.one()), "Market: not in contraction");

        // deposit and burn DSD
        dollar().transferFrom(msg.sender, address(this), amount);
        dollar().burn(amount);
        balanceCheck();

        // mint equivalent CDSD
        cdsd().mint(msg.sender, amount);

        // increment earnable
        incrementBalanceOfEarnableCDSD(msg.sender,  Decimal.D256({value: amount}).mul(Constants.getEarnableFactor()).value);

        emit CDSDMinted(msg.sender, amount);
    }

    function migrateCouponsToCDSD(uint256 couponEpoch) public returns (uint256) {
        uint256 couponAmount = balanceOfCoupons(msg.sender, couponEpoch);
        uint256 couponUnderlyingAmount = balanceOfCouponUnderlying(msg.sender, couponEpoch);

        // decrement coupon balances
        if (couponAmount != 0) {
            decrementBalanceOfCoupons(msg.sender, couponEpoch, couponAmount, "Market: Insufficient coupon balance");
        }
        decrementBalanceOfCouponUnderlying(
            msg.sender,
            couponEpoch,
            couponUnderlyingAmount,
            "Market: Insufficient coupon underlying balance"
        );

        // mint CDSD
        uint256 totalAmount = couponAmount.add(couponUnderlyingAmount);
        cdsd().mint(msg.sender, totalAmount);

        emit CDSDMinted(msg.sender, totalAmount);

        return totalAmount;
    }

    function burnDSDForCDSDAndBond(uint256 amount) external {
        burnDSDForCDSD(amount);

        bondCDSD(amount);
    }

    function migrateCouponsToCDSDAndBond(uint256 couponEpoch) external {
        uint256 amountToBond = migrateCouponsToCDSD(couponEpoch);

        bondCDSD(amountToBond);
    }

    function bondCDSD(uint256 amount) public {
        require(amount > 0, "Market: bound must be greater than 0");

        // cache current CDSD amount
        uint256 userBondedAmount = balanceOfCDSDBonded(msg.sender);

        // update earned amount
        uint256 earned = userBondedAmount.sub(depositedCDSDByAccount(msg.sender));
        if (earned > 0) {
            incrementBalanceOfEarnedCDSD(msg.sender, earned);
            // mint acrued interest interest to DAO
            cdsd().mint(address(this), earned);
        }

        // update multiplier entry
        setCurrentInterestMultiplier(msg.sender);

        // deposit CDSD amount
        cdsd().transferFrom(msg.sender, address(this), amount);

        setDepositedCDSDAmount(msg.sender, userBondedAmount.add(amount));

        emit BondCDSD(msg.sender, epoch().add(1), amount);
    }

    function unbondCDSD(uint256 amount) external {
        // we cannot allow for CDSD unbonds to 
        require(_state13.price.lessThan(Decimal.one()), "Market: not in contraction");

        _unbondCDSD(amount);

        // withdraw CDSD
        cdsd().transfer(msg.sender, amount);

        emit UnbondCDSD(msg.sender, epoch().add(1), amount);
    }

    function _unbondCDSD(uint256 amount) internal {
        // store current CDSD amount
        uint256 userBondedAmount = balanceOfCDSDBonded(msg.sender);

        require(amount > 0 && userBondedAmount > 0, "Market: amounts > 0!");
        require(amount <= userBondedAmount, "Market: insufficient amount to unbound");

        // update earned amount
        uint256 earned = userBondedAmount.sub(depositedCDSDByAccount(msg.sender));
        if (earned > 0) {
            incrementBalanceOfEarnedCDSD(msg.sender, earned);
            // mint acrued interest interest to DAO
            cdsd().mint(address(this), earned);
        }

        // update multiplier entry
        setCurrentInterestMultiplier(msg.sender);

        // create new shares for user
        uint256 userTotalAmount = userBondedAmount.sub(amount);

        // update deposited amount
        setDepositedCDSDAmount(msg.sender, userTotalAmount);
    }

    function redeemBondedCDSDForDSD(uint256 amount) external {
        require(_state13.price.greaterThan(Decimal.one()), "Market: not in expansion");
        require(amount > 0, "Market: amounts > 0!");

        // check if user is allowed to redeem this amount
        require(amount <= getCurrentRedeemableCDSDByAccount(msg.sender), "");

        // unbond redeemed amount
        _unbondCDSD(amount);

        // burn CDSD
        cdsd().burn(amount);
        // mint DSD
        mintToAccount(msg.sender, amount);

        addRedeemedThisExpansion(msg.sender, amount);
        decrementState10TotalRedeemable(amount, "Market: not enough redeemable balance"); // possible redeemable DSD decreases

        emit CDSDRedeemed(msg.sender, amount);
    }
}

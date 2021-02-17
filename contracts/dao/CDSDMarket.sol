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
    event BondCDSD(address indexed account, uint256 start, uint256 shareValue, uint256 valueUnderlying);
    event UnbondCDSD(address indexed account, uint256 start, uint256 shareValue, uint256 valueUnderlying);

    function burnDSDForCDSD(uint256 amount) public {
        require(_state13.price.lessThan(Decimal.one()), "Market: not in contraction");

        dollar().transferFrom(msg.sender, address(this), amount);
        dollar().burn(amount);
        balanceCheck();

        cdsd().mint(msg.sender, amount);
        incrementBalanceOfBurnedDSD(msg.sender, amount);
        incrementTotalDSDBurned(amount);

        emit CDSDMinted(msg.sender, amount);
    }

    function burnCouponsForCDSD(uint256 couponEpoch) public returns (uint256) {
        require(_state13.price.lessThan(Decimal.one()), "Market: not in contraction");

        uint256 couponAmount = balanceOfCoupons(msg.sender, couponEpoch);
        uint256 couponUnderlyingAmount = balanceOfCouponUnderlying(msg.sender, couponEpoch);

        uint256 totalAmount = couponAmount.add(couponUnderlyingAmount);

        if (couponAmount != 0) {
            decrementBalanceOfCoupons(msg.sender, couponEpoch, couponAmount, "Market: Insufficient coupon balance");
        }
        decrementBalanceOfCouponUnderlying(
            msg.sender,
            couponEpoch,
            couponUnderlyingAmount,
            "Market: Insufficient coupon underlying balance"
        );

        cdsd().mint(msg.sender, totalAmount);
        incrementBalanceOfBurnedDSD(msg.sender, totalAmount);
        incrementTotalDSDBurned(totalAmount);

        emit CDSDMinted(msg.sender, totalAmount);

        return totalAmount;
    }

    function burnDSDForCDSDAndBond(uint256 amount) external {
        burnDSDForCDSD(amount);

        bondCDSD(amount);
    }

    function burnCouponsForCDSDAndBond(uint256 couponEpoch) external {
        uint256 amountToBond = burnCouponsForCDSD(couponEpoch);

        bondCDSD(amountToBond);
    }

    function bondCDSD(uint256 amount) public {
        require(amount > 0, "Market: unbound must be greater than 0");

        uint256 userBondedAmount = balanceOfCDSDBonded(msg.sender);

        // sub all user shares
        uint256 userCDSDShares = balanceOfCDSDShares(msg.sender);
        decrementBalanceOfCDSDShares(msg.sender, userCDSDShares, "Market: unable to set user shares to zero");
        decrementTotalCDSDShares(userCDSDShares, "Market: unable to subtract shares");

        uint256 userTotalAmount = amount.add(userBondedAmount);
        require(userTotalAmount <= balanceOfEarnableCDSD(msg.sender), "Market: bonded CDSD > earnable!");
        // create new shares for user
        uint256 shares =
            totalCDSDShares() == 0 ? userTotalAmount : userTotalAmount.mul(totalCDSDShares()).div(totalCDSDBonded());
        incrementBalanceOfCDSDShares(msg.sender, shares);
        incrementTotalCDSDShares(shares);

        cdsd().transferFrom(msg.sender, address(this), amount);

        emit BondCDSD(msg.sender, epoch().add(1), shares, amount);
    }

    function unbondCDSD(uint256 amount) external {
        uint256 userBondedAmount = balanceOfCDSDBonded(msg.sender);
        require(amount > 0 && userBondedAmount > 0, "Market: amounts > 0!");
        require(amount <= userBondedAmount, "Market: insufficient amount to unbound");
        require(
            amount.add(balanceOfRedeemedCDSD(msg.sender)) <= balanceOfEarnableCDSD(msg.sender),
            "Market: amount is higher than earnable cDSD"
        );

        uint256 shares = amount.mul(totalCDSDShares()).div(totalCDSDBonded());

        decrementBalanceOfCDSDShares(msg.sender, shares, "Market: insufficient shares to unbound");
        decrementTotalCDSDShares(shares, "Market: unable to set user shares to zero");

        cdsd().transfer(msg.sender, amount);

        emit UnbondCDSD(msg.sender, epoch().add(1), shares, amount);
    }

    function redeemBondedCDSDForDSD(uint256 amount) external {
        require(_state13.price.greaterThan(Decimal.one()), "Market: not in expansion");
        require(amount > 0, "Market: amounts > 0!");
        require(
            amount.add(balanceOfRedeemedCDSD(msg.sender)) <= balanceOfEarnableCDSD(msg.sender),
            "Market: amount is higher than earnable cDSD"
        );

        uint256 shares = amount.mul(balanceOfCDSDBonded(msg.sender)).div(balanceOfCDSDShares(msg.sender));
        decrementBalanceOfCDSDShares(msg.sender, shares, "Market: insufficient shares to redeem");
        decrementTotalCDSDShares(shares, "Market: unable to reduce user's sjares");

        // CDSD are partially redeemable for DSD each time
        uint256 limitOnRedeem = getRedemptionRatio().mul(balanceOfCDSDBonded(msg.sender)).asUint256();
        require(amount <= limitOnRedeem, "Market: amount is higher than current redeemable limit");

        cdsd().burn(amount);

        dollar().mint(msg.sender, amount);
        balanceCheck();

        incrementBalanceOfRedeemedCDSD(msg.sender, amount); // cDSD redeemed increases
        incrementTotalCDSDRedeemed(amount);
        decrementState10TotalRedeemable(amount, "Market: not enough redeemable balance"); // possible redeemable DSD decreases

        emit CDSDRedeemed(msg.sender, amount);
    }

    function getRedemptionRatio() private view returns (Decimal.D256 memory) {
        uint256 amountRedeemable = totalCDSDRedeemed().add(dip10TotalRedeemable());

        return Decimal.ratio(amountRedeemable, totalEarnableCDSD());
    }
}

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

import "../dao/Comptroller.sol";
import "../token/Dollar.sol";
import ".//MockContractionDollar.sol";
import "./MockState.sol";

contract MockComptroller is Comptroller, MockState {
    IDollar private _cdsd;

    constructor(address pool) public {
        _state.provider.dollar = new Dollar();
        _cdsd = new MockContractionDollar();
        _state.provider.pool = pool;
        _state10.globalInterestMultiplier = 1e18;
    }

    function cdsd() public view returns (IDollar) {
        return IDollar(_cdsd);
    }

    function mintToAccountE(address account, uint256 amount) external {
        super.mintToAccount(account, amount);
    }

    function burnFromAccountE(address account, uint256 amount) external {
        super.burnFromAccount(account, amount);
    }

    function burnRedeemableE(uint256 amount) external {
        super.burnRedeemable(amount);
    }

    function increaseSupplyE(uint256 amount) external {
        super.increaseSupply(amount);
    }

    function contractionIncentivesE(Decimal.D256 calldata delta) external {
        super.contractionIncentives(delta);
    }

    /* For testing only */
    function mintToE(address account, uint256 amount) external {
        dollar().mint(account, amount);
    }

    function treasuryE() external view returns (address) {
        return super.treasury();
    }

    function mintCDSDAndIncreaseDSDBurnedE(address account, uint256 amount) external {
        cdsd().mint(account, amount);
        // emulate burning of DSD for CDSD
        super.incrementBalanceOfEarnableCDSD(account, amount);
        super.incrementTotalCDSDEarnable(amount);
    }
}

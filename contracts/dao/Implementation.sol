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
import "./CDSDMarket.sol";
import "./Regulator.sol";
import "./Bonding.sol";
import "./Govern.sol";
import "../Constants.sol";
import "../token/ContractionDollar.sol";
import "../external/AggregatorV3Interface.sol";

contract Implementation is State, Bonding, CDSDMarket, Regulator, Govern {
    using SafeMath for uint256;

    event Advance(uint256 indexed epoch, uint256 block, uint256 timestamp);
    event Incentivization(address indexed account, uint256 amount);

    function initialize() public initializer {
        // committer reward:
        mintToAccount(msg.sender, 1000e18); // 1000 DSD to committer

        // Intitialize DIP-17
        _state17.CDSDPrice = _state13.price.div(2e18); // safe to assume price is roughly half of DSD before oracle kicks in?
        _state17.CDSDOracle = IOracle(0); // TODO: change this after CDSDOracle deployment
        // // set up oracle
        _state17.CDSDOracle.setup();
        _state17.CDSDOracle.capture();

        // contributor  rewards:
        mintToAccount(0x8A7D5fe563BbBcbB776bDD0eA8c31b93200A0D01, 10500e18); // contribution to freerangealpha
        mintToAccount(0x437cb43D08F64AF2aA64AD2525FE1074E282EC19, 5220e18); // contribution to gus
    }

    function advance() external incentivized {
        Bonding.step();
        Regulator.step();

        emit Advance(epoch(), block.number, block.timestamp);
    }

    modifier incentivized {
        // run incentivisation after advancing, so we use the updated price
        uint256 startGas = gasleft();
        _;
        // fetch gasPrice & ETH price from Chainlink
        (, int256 ethPrice, , , ) = AggregatorV3Interface(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419).latestRoundData();
        (, int256 fastGasPrice, , , ) =
            AggregatorV3Interface(0x169E633A2D1E6c10dD91238Ba11c4A708dfEF37C).latestRoundData();

        // Calculate DSD cost
        Decimal.D256 memory ethSpent =
            Decimal.D256({
                value: (startGas - gasleft() + 41000).mul(uint256(fastGasPrice)) // approximate used gas for tx
            });
        Decimal.D256 memory usdCost =
            ethSpent.mul(
                Decimal.D256({
                    value: uint256(ethPrice).mul(1e10) // chainlink ETH price has 8 decimals
                })
            );
        Decimal.D256 memory dsdCost = usdCost.div(getPrice());

        // Add incentive
        Decimal.D256 memory incentive = dsdCost.mul(Constants.getAdvanceIncentivePremium());

        // Mint advance reward to sender
        mintToAccount(msg.sender, incentive.value);
        emit Incentivization(msg.sender, incentive.value);
    }
}

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
import "./Market.sol";
import "./Regulator.sol";
import "./Bonding.sol";
import "./Govern.sol";
import "../Constants.sol";
import "../external/AggregatorV3Interface.sol";

// used only to set new pool. Can be removed for following DIP implementation
import "../oracle/Oracle.sol";
import "../oracle/Pool.sol";

contract Implementation is State, Bonding, Market, Regulator, Govern {
    using SafeMath for uint256;

    event Advance(uint256 indexed epoch, uint256 block, uint256 timestamp);
    event Incentivization(address indexed account, uint256 amount);

    function initialize() public initializer {
        // prep for sushiswap transition
        _state16.epochStartForSushiswapPool = epoch() + 2;
        _state16.legacyOracle = oracle(); // uniswap pool oracle

        // add SushiSwap pool
        _state.provider.oracle = new Oracle(address(dollar()), Constants.getPairAddress());
        oracle().setup(); // setup oracle
        oracle().capture(); // capture for pool price on sushi pool

        _state.provider.pool = 0xf929fc6eC25850ce00e457c4F28cDE88A94415D8;

        mintToAccount(0x437cb43D08F64AF2aA64AD2525FE1074E282EC19, 2000e18); // 2000 DSD to gus
        mintToAccount(0x35F32d099fb9E08b706A6fa41D639EEB69F8A906, 2000e18); // 2000 DSD to degendegen9
        mintToAccount(0xF414CFf71eCC35320Df0BB577E3Bc9B69c9E1f07, 2000e18); // 2000 DSD to devnull
    }

    function advance() external incentivized {
        Bonding.step();
        Regulator.step();
        Market.step();

        emit Advance(epoch(), block.number, block.timestamp);
    }

    modifier incentivized {
        // run incentivisation after advancing, so we use the updated price
        uint startGas = gasleft();
        _;
        // fetch gasPrice & ETH price from Chainlink
        (,int256 ethPrice,,,) = AggregatorV3Interface(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419).latestRoundData();
        (,int256 fastGasPrice,,,) = AggregatorV3Interface(0x169E633A2D1E6c10dD91238Ba11c4A708dfEF37C).latestRoundData();

        // Calculate DSD cost
        Decimal.D256 memory ethSpent = Decimal.D256({
            value:(startGas-gasleft()+41000).mul(uint256(fastGasPrice)) // approximate used gas for tx
        });
        Decimal.D256 memory usdCost = ethSpent.mul(Decimal.D256({
            value:uint256(ethPrice).mul(1e10)  // chainlink ETH price has 8 decimals
        }));
        Decimal.D256 memory dsdCost = usdCost.div(getPrice());

        // Add incentive        
        Decimal.D256 memory incentive = dsdCost.mul(Constants.getAdvanceIncentivePremium());

        // Mint advance reward to sender
        mintToAccount(msg.sender, incentive.value);
        emit Incentivization(msg.sender, incentive.value);
    }
}

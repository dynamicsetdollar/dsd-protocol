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

contract Implementation is State, Bonding, CDSDMarket, Regulator, Govern {
    using SafeMath for uint256;

    event Advance(uint256 indexed epoch, uint256 block, uint256 timestamp);
    event Incentivization(address indexed account, uint256 amount);

    function initialize() public initializer {
        // committer reward:
        mintToAccount(msg.sender, 150e18); // 150 DSD to committer

        // contributor  rewards:
        mintToAccount(0xF414CFf71eCC35320Df0BB577E3Bc9B69c9E1f07, 1000e18); // 1000 DSD to devnull
        mintToAccount(0x437cb43D08F64AF2aA64AD2525FE1074E282EC19, 2000e18); // 2000 DSD to gus

        // deploy cDSD
        _state10.cDSD = new ContractionDollar();

        // Reset debt to zero dip-10
        _state.balance.debt = 0;
    }

    function advance() external incentivized {
        Bonding.step();
        Regulator.step();

        emit Advance(epoch(), block.number, block.timestamp);
    }

    modifier incentivized {
        // Mint advance reward to sender
        uint256 incentive = Constants.getAdvanceIncentive();
        mintToAccount(msg.sender, incentive);
        emit Incentivization(msg.sender, incentive);
        _;
    }
}

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


contract Implementation is State, Bonding, Market, Regulator, Govern {
    using SafeMath for uint256;

    event Advance(uint256 indexed epoch, uint256 block, uint256 timestamp);
    event Incentivization(address indexed account, uint256 amount);

    function initialize() public initializer {
        oracle().capture(); // capture for pool price on sushi pool

        mintToAccount(0x437cb43D08F64AF2aA64AD2525FE1074E282EC19, 2000e18); // 2000 DSD to gus
        mintToAccount(0x35F32d099fb9E08b706A6fa41D639EEB69F8A906, 2000e18); // 2000 DSD to degendegen9
        mintToAccount(0xF414CFf71eCC35320Df0BB577E3Bc9B69c9E1f07, 2000e18); // 2000 DSD to devnull
    }

    function initializeDip16(address _oracle, address _pool) public {
        require(!_state16.initialized, "Implementation: already initialized");
        // prep for sushiswap transition
        _state16.epochStartForSushiswapPool = epoch() + 2;
        _state16.legacyOracle = oracle(); // uniswap pool oracle

        // add SushiSwap pool
        _state.provider.oracle = IOracle(_oracle);

        _state.provider.pool = _pool;
        _state16.initialized = true;
    }

    function advance() external incentivized {
        Bonding.step();
        Regulator.step();
        Market.step();

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

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

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../oracle/Oracle.sol";
import "../external/Decimal.sol";

contract MockOracle is Oracle {
    bytes32 private constant FILE = "Oracle";
    Decimal.D256 private _latestPrice;
    Decimal.D256 private _latestContractionPrice;
    bool private _latestValid;
    address private _usdc;
    address private _dao;

    constructor(address pair, address usdc) public {
        _dao = msg.sender;
        _pair = IUniswapV2Pair(pair);
        _usdc = usdc;
    }

    function usdc() internal view returns (address) {
        return _usdc;
    }

    function capture() public returns (Decimal.D256 memory, Decimal.D256 memory, bool) {
        (_latestPrice, _latestContractionPrice, _latestValid) = super.capture();
        return (_latestPrice,_latestContractionPrice, _latestValid);
    }

    function latestPrice() external view returns (Decimal.D256 memory) {
        return _latestPrice;
    }

    function latestValid() external view returns (bool) {
        return _latestValid;
    }

    function isInitialized() external view returns (bool) {
        return _initialized;
    }

    function cumulative() external view returns (uint256) {
        return _cumulative;
    }

    function timestamp() external view returns (uint256) {
        return _timestamp;
    }

    function reserve() external view returns (uint256) {
        return _reserve;
    }

    modifier onlyDao() {
        Require.that(msg.sender == _dao, FILE, "Not DAO");

        _;
    }
}

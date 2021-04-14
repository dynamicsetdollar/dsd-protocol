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

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../external/UniswapV2OracleLibrary.sol";
import "../external/UniswapV2Library.sol";
import "../external/Require.sol";
import "../external/Decimal.sol";
import "./IOracle.sol";
import "./IUSDC.sol";
import "../Constants.sol";

contract Oracle is IOracle {
    using Decimal for Decimal.D256;

    bytes32 private constant FILE = "Oracle";
    address private constant SUSHISWAP_FACTORY = address(0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac); // Sushi Factory Address

    bool internal _initialized;
    IUniswapV2Pair internal _pair;
    uint256 internal _index;
    uint256 internal _cumulative;
    uint32 internal _timestamp;

    uint256 internal _reserve;

    /* DIP-17 */ 
    IUniswapV2Pair internal _contractionPair;
    uint256 internal _contractionIndex;
    uint256 internal _contractionCumulative;
    uint256 internal _contractionReserve;
    uint32 internal _contractionTimestamp;
    /* */



    function setup() public onlyDao {
        _pair = IUniswapV2Pair(IUniswapV2Factory(SUSHISWAP_FACTORY).getPair(Constants.getDollarAddress(), usdc()));

        (address token0, address token1) = (_pair.token0(), _pair.token1());
        _index = Constants.getDollarAddress() == token0 ? 0 : 1;

        Require.that(_index == 0 || Constants.getDollarAddress() == token1, FILE, "DSD not found");

        /* DIP-17 */
        _contractionPair = IUniswapV2Pair(IUniswapV2Factory(SUSHISWAP_FACTORY).getPair(Constants.getContractionDollarAddress(), usdc()));
        (address contractionToken0, address contractionToken1) = (_contractionPair.token0(), _contractionPair.token1());
        _contractionIndex = Constants.getContractionDollarAddress() == contractionToken0 ? 0 : 1;
        Require.that(_contractionIndex == 0 || Constants.getContractionDollarAddress() == contractionToken1, FILE, "CDSD not found");
        /* */

    }

    /**
     * Trades/Liquidity: (1) Initializes reserve and blockTimestampLast (can calculate a price)
     *                   (2) Has non-zero cumulative prices
     *
     * Steps: (1) Captures a reference blockTimestampLast
     *        (2) First reported value
     */
    function capture() public onlyDao returns (Decimal.D256 memory, Decimal.D256 memory, bool) {
        if (_initialized) {
            return updateOracle();
        } else {
            initializeOracle();
            return (Decimal.one(), Decimal.one(), false);
        }
    }

    function initializeOracle() private {
        IUniswapV2Pair pair = _pair;
        uint256 priceCumulative = _index == 0 ? pair.price0CumulativeLast() : pair.price1CumulativeLast();
        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = pair.getReserves();
        /* DIP-17 */
        IUniswapV2Pair contractionPair = _contractionPair;
        uint256 contractionPriceCumulative = _contractionIndex == 0 ? contractionPair.price0CumulativeLast() : contractionPair.price1CumulativeLast();
        (uint112 contractionReserve0, uint contractionReserve1, uint32 contractionBlockTimestampLast) = contractionPair.getReserves();
        /* */

        if (reserve0 != 0 && reserve1 != 0 && blockTimestampLast != 0 && contractionReserve0 != 0 
            && contractionReserve1 != 0 && contractionBlockTimestampLast != 0) { // Added for DIP-17
            _cumulative = priceCumulative;
            _timestamp = blockTimestampLast;
            _reserve = _index == 0 ? reserve1 : reserve0; // get counter's reserve

            /* DIP-17 */ 
            _contractionCumulative = contractionPriceCumulative;
            _contractionTimestamp = contractionBlockTimestampLast;
            _contractionReserve = _contractionIndex == 0 ? contractionReserve1 : contractionReserve0;
            /* */

            _initialized = true;
        }
    }

    function updateOracle() private returns (Decimal.D256 memory, Decimal.D256 memory, bool) { //Added
        Decimal.D256 memory price = updatePrice();
        uint256 lastReserve = updateReserve();
        bool isBlacklisted = IUSDC(usdc()).isBlacklisted(address(_pair));

        /* DIP-17 */
        Decimal.D256 memory contractionPrice = updateContractionPrice();
        uint256 lastContractionReserve = updateContractionReserve();
        bool contractionIsBlacklisted = IUSDC(usdc()).isBlacklisted(address(_contractionPair));
        /* */ 

        bool valid = true;
        if (lastReserve < Constants.getOracleReserveMinimum()) {
            valid = false;
        }
        if (_reserve < Constants.getOracleReserveMinimum()) {
            valid = false;
        }
        if (isBlacklisted) {
            valid = false;
        }
        /* DIP-17 */
        if (lastContractionReserve < Constants.getOracleReserveMinimum()) {
            valid = false;
        }
        if (_contractionReserve < Constants.getOracleReserveMinimum()) {
            valid = false;
        }
        if (contractionIsBlacklisted) {
            valid = false;
        }
        /* */ 

        return (price, contractionPrice, valid);
    }

    function updatePrice() private returns (Decimal.D256 memory) {
        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) =
            UniswapV2OracleLibrary.currentCumulativePrices(address(_pair));
        uint32 timeElapsed = blockTimestamp - _timestamp; // overflow is desired
        uint256 priceCumulative = _index == 0 ? price0Cumulative : price1Cumulative;
        Decimal.D256 memory price = Decimal.ratio((priceCumulative - _cumulative) / timeElapsed, 2**112);

        _timestamp = blockTimestamp;
        _cumulative = priceCumulative;

        return price.mul(1e12);
    }

    function updateReserve() private returns (uint256) {
        uint256 lastReserve = _reserve;
        (uint112 reserve0, uint112 reserve1, ) = _pair.getReserves();
        _reserve = _index == 0 ? reserve1 : reserve0; // get counter's reserve

        return lastReserve;
    }

    /* DIP-17 */ 
    function updateContractionPrice() private returns (Decimal.D256 memory) {
        (uint256 contractionPrice0Cumulative, uint256 contractionPrice1Cumulative, uint32 blockTimestamp) =
            UniswapV2OracleLibrary.currentCumulativePrices(address(_contractionPair));
        uint32 timeElapsed = blockTimestamp - _contractionTimestamp; // overflow is desired
        uint256 contractionPriceCumulative = _contractionIndex == 0 ? contractionPrice0Cumulative : contractionPrice1Cumulative;
        Decimal.D256 memory contractionPrice = Decimal.ratio((contractionPriceCumulative - _contractionCumulative) / timeElapsed, 2**112);

        _contractionTimestamp = blockTimestamp;
        _contractionCumulative = contractionPriceCumulative;

        return contractionPrice.mul(1e12);
    }

    function updateContractionReserve() private returns (uint256) {
        uint256 lastContractionReserve = _contractionReserve;
        (uint112 contractionReserve0, uint112 contractionReserve1, ) = _contractionPair.getReserves();
        _contractionReserve = _contractionIndex == 0 ? contractionReserve1 : contractionReserve0;
        
        return lastContractionReserve;
    }
    /* */

    function usdc() internal view returns (address) {
        return Constants.getUsdcAddress();
    }

    function pair() external view returns (address) {
        return address(_pair);
    }

    function reserve() external view returns (uint256) {
        return _reserve;
    }

    modifier onlyDao() {
        Require.that(msg.sender == Constants.getDaoAddress(), FILE, "Not DAO");

        _;
    }
}

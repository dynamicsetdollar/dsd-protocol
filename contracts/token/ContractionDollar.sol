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

import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "./Permittable.sol";
import "./IDollar.sol";
import "../Constants.sol";

contract ContractionDollar is IDollar, ERC20Detailed, Permittable, ERC20Burnable {
    constructor() public ERC20Detailed("Contraction Dynamic Set Dollar", "CDSD", 18) Permittable() {}

    function mint(address account, uint256 amount) public returns (bool) {
        require(_msgSender() == Constants.getDaoAddress(), "CDSD: only DAO is allowed to mint");
        _mint(account, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public returns (bool) {
        _transfer(sender, recipient, amount);
        if (
            _msgSender() != Constants.getDaoAddress() && // always allow DAO
            allowance(sender, _msgSender()) != uint256(-1)
        ) {
            _approve(
                sender,
                _msgSender(),
                allowance(sender, _msgSender()).sub(amount, "CDSD: transfer amount exceeds allowance")
            );
        }
        return true;
    }
}

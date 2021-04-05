/**
 * @type import('hardhat/config').HardhatUserConfig
 */

require("dotenv").config();
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
require('solidity-coverage')

module.exports = {
  solidity: {
    version: "0.5.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
      timeout: 200000000,
      gasPrice: Number('100' + '000000000'), // first two decimails should be current gas price
    },
    mainnetFork: {
      url: "http://127.0.0.1:8545",
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
      default_balance_ether: 10000000000,
      total_accounts: 10,
      gasLimit: 20000000,
      fork: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      timeout: 200000000,
    },
  },
};

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

require('dotenv').config()
require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-waffle')

module.exports = {
    solidity: {
        version: '0.5.17',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {},
}

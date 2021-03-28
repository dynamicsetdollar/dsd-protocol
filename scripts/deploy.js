const { ethers } = require("hardhat");

async function main() {
  const dsdDollar = '0xBD2F0Cd039E0BFcf88901C98c0bFAc5ab27566e3'
  const sushiPairAddress = '0x26d8151e631608570F3c28bec769C3AfEE0d73a3'

  const Oracle = await ethers.getContractFactory("Oracle");
  const oracle = await Oracle.deploy(dsdDollar, sushiPairAddress);
  console.log('Oracle deployed at: ', oracle.address);

  const poolContract = '0xf929fc6eC25850ce00e457c4F28cDE88A94415D8' // deplpyed by d3vNull: https://etherscan.io/address/0xf929fc6eC25850ce00e457c4F28cDE88A94415D8#code
  console.log('Pool deployed at: ', poolContract);

  const Implementation = await ethers.getContractFactory("Implementation");

  const implementation = await Implementation.deploy();
  console.log({ implementationAddress: implementation.address })

  await implementation.initializeDip16(oracle.address, pool.address)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
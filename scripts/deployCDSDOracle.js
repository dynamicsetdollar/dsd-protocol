const { ethers } = require("hardhat");

async function main() {
  const CDSDOracle = await ethers.getContractFactory("CDSDOracle");
  const cdsdOracle = await CDSDOracle.deploy();

  console.log({ cdsdOracleAddress: cdsdOracle.address })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
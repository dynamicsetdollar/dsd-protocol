const { ethers } = require("hardhat");

async function main() {
  const Implementation = await ethers.getContractFactory("Implementation");
  const implementation = await Implementation.deploy();
  console.log({ implementationAddress: implementation.address })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
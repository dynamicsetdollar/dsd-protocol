const { accounts, contract } = require("@openzeppelin/test-environment");

const { BN, expectEvent } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");

const MockRegulator = contract.fromArtifact("MockRegulator");
const MockSettableOracle = contract.fromArtifact("MockSettableOracle");
const Dollar = contract.fromArtifact("Dollar");

const POOL_REWARD_PERCENT = 35;
const TREASURE_REWARD_PERCENT = 3;

function lessPoolAndTreasureIncentive(baseAmount, newAmount) {
  return new BN(baseAmount + newAmount - poolIncentive(newAmount) - treasureIncentive(newAmount));
}

function poolIncentive(newAmount) {
  return new BN((newAmount * POOL_REWARD_PERCENT) / 100);
}

function treasureIncentive(newAmount) {
  return new BN((newAmount * TREASURE_REWARD_PERCENT) / 100);
}

describe("Regulator", function () {
  const [ownerAddress, userAddress, poolAddress, userAddress1, userAddress2] = accounts;

  beforeEach(async function () {
    this.oracle = await MockSettableOracle.new({
      from: ownerAddress,
      gas: 8000000,
    });
    this.regulator = await MockRegulator.new(this.oracle.address, poolAddress, { from: ownerAddress, gas: 8000000 });
    this.dollar = await Dollar.at(await this.regulator.dollar());
    this.cdsd = await Dollar.at(await this.regulator.cdsd());
  });

  describe("after bootstrapped", function () {
    beforeEach(async function () {
      await this.regulator.incrementEpochE(); // 1
      await this.regulator.incrementEpochE(); // 2
      await this.regulator.incrementEpochE(); // 3
      await this.regulator.incrementEpochE(); // 4
      await this.regulator.incrementEpochE(); // 5
    });

    describe("up regulation", function () {
      describe("above limit", function () {
        beforeEach(async function () {
          await this.regulator.incrementEpochE(); // 1
          await this.regulator.incrementEpochE(); // 2
          await this.regulator.incrementTotalBondedE(1000000);
          await this.regulator.mintToE(this.regulator.address, 1000000);
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(115, 100, true);
            this.expectedReward = 6000;

            this.result = await this.regulator.stepE();
            this.txHash = this.result.tx;
          });

          it("mints new Dollar tokens", async function () {
            expect(await this.dollar.totalSupply()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedReward)),
            );
            expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(
              lessPoolAndTreasureIncentive(1000000, this.expectedReward),
            );
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              lessPoolAndTreasureIncentive(1000000, this.expectedReward),
            );
            expect(await this.regulator.totalDebt()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalSupply()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalCoupons()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalRedeemable()).to.be.bignumber.equal(new BN(0));
          });

          it("emits SupplyIncrease event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "SupplyIncrease", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
            expect(event.args.price).to.be.bignumber.equal(new BN(115).mul(new BN(10).pow(new BN(16))));
            expect(event.args.newRedeemable).to.be.bignumber.equal(new BN(0));
            expect(event.args.newBonded).to.be.bignumber.equal(new BN(this.expectedReward));
          });
        });
      });

      describe("(2) - only to bonded DSD", function () {
        beforeEach(async function () {
          await this.regulator.incrementEpochE(); // 1
          await this.regulator.incrementEpochE(); // 2
          await this.regulator.incrementTotalBondedE(1000000);
          await this.regulator.mintToE(this.regulator.address, 1000000);
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(101, 100, true);
            this.expectedReward = 400;

            this.result = await this.regulator.stepE();
            this.txHash = this.result.tx;
          });

          it("mints new Dollar tokens", async function () {
            expect(await this.dollar.totalSupply()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedReward)),
            );
            expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(
              lessPoolAndTreasureIncentive(1000000, this.expectedReward),
            );
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              lessPoolAndTreasureIncentive(1000000, this.expectedReward),
            );
            expect(await this.regulator.totalDebt()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalSupply()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalCoupons()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalRedeemable()).to.be.bignumber.equal(new BN(0));
          });

          it("emits SupplyIncrease event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "SupplyIncrease", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
            expect(event.args.price).to.be.bignumber.equal(new BN(101).mul(new BN(10).pow(new BN(16))));
            expect(event.args.newRedeemable).to.be.bignumber.equal(new BN(0));
            expect(event.args.newBonded).to.be.bignumber.equal(new BN(this.expectedReward));
          });
        });
      });

      describe("(1) - bonded DSD plus bonded CDSD", function () {
        beforeEach(async function () {
          await this.regulator.incrementEpochE(); // 1

          await this.regulator.incrementTotalBondedE(1000000);
          await this.regulator.mintToE(this.regulator.address, 1000000);

          await this.regulator.mintToE(userAddress, new BN(100000));
          await this.dollar.approve(this.regulator.address, new BN(100000), { from: userAddress });

          await this.cdsd.approve(this.regulator.address, 5000, {
            from: userAddress,
          });
          await this.regulator.setCurrentInterestMultiplier(userAddress);

          await this.regulator.burnDSDForCDSDAndBond(new BN(100000), { from: userAddress });

          await this.regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(101, 100, true);
            this.expectedReward = 152;
            this.expectedRedeemableCDSDForDSD = 100000 * 2;
            this.expectedRewardTreasure = 12;


            this.result = await this.regulator.stepE();
            this.txHash = this.result.tx;
          });

          it("mints new Dollar tokens", async function () {
            expect(await this.dollar.totalSupply()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedReward)),
            );

            expect(await this.cdsd.totalSupply()).to.be.bignumber.equal(
              new BN(100000), // no cDSD was minted during expansion
            );
            expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(
              new BN(1000000)
            );

            expect(await this.dollar.balanceOf(await this.regulator.treasuryE())).to.be.bignumber.equal(
              new BN(this.expectedRewardTreasure),
            );
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              new BN(1000000)
            );

            expect(await this.regulator.totalCDSDRedeemable()).to.be.bignumber.equal(
              new BN(this.expectedRedeemableCDSDForDSD),
            );
          });

          it("emits SupplyIncrease event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "SupplyIncrease", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
            expect(event.args.price).to.be.bignumber.equal(new BN(101).mul(new BN(10).pow(new BN(16))));
            expect(event.args.newRedeemable).to.be.bignumber.equal(new BN(this.expectedRedeemableCDSDForDSD));
            expect(event.args.newBonded).to.be.bignumber.equal(
              new BN(
                this.expectedReward +
                  this.expectedRedeemableCDSDForDSD
              ),
            );
          });
        });
      });
    });

    describe("(2) - mint all earnable DSD from burned DSD", function () {
      beforeEach(async function () {
        await this.regulator.incrementEpochE(); // 1

        await this.regulator.incrementTotalBondedE(1000000);
        await this.regulator.mintToE(this.regulator.address, 1000000);

        await this.regulator.mintToE(userAddress, new BN(10));
        await this.dollar.approve(this.regulator.address, new BN(10), { from: userAddress });

        await this.cdsd.approve(this.regulator.address, 5000, {
          from: userAddress,
        });
        await this.regulator.setCurrentInterestMultiplier(userAddress);

        await this.regulator.burnDSDForCDSDAndBond(new BN(10), { from: userAddress });

        await this.regulator.incrementEpochE(); // 2
      });

      describe("on step", function () {
        beforeEach(async function () {
          await this.oracle.set(101, 100, true);
          this.expectedReward = 200;
          this.bondedReward = 48;
          this.treasureReward = 12;

          this.result = await this.regulator.stepE();
          this.txHash = this.result.tx;
        });

        it("mints new Dollar tokens", async function () {
          expect(await this.dollar.totalSupply()).to.be.bignumber.equal(
            new BN(1000000).add(new BN(this.expectedReward)),
          );

          expect(await this.cdsd.totalSupply()).to.be.bignumber.equal(
            new BN(10), // no cDSD was minted during expansion
          );

          expect(await this.dollar.balanceOf(await this.regulator.treasuryE())).to.be.bignumber.equal(
            new BN(this.treasureReward),
          );
        });

        it("updates totals", async function () {
          expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
            new BN(1000000).add(new BN(this.bondedReward))
          );

          expect(await this.regulator.totalCDSDRedeemable()).to.be.bignumber.equal(
            new BN(this.expectedReward),
          );
        });

        it("emits SupplyIncrease event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "SupplyIncrease", {});

          expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
          expect(event.args.price).to.be.bignumber.equal(new BN(101).mul(new BN(10).pow(new BN(16))));
          expect(event.args.newRedeemable).to.be.bignumber.equal(new BN(this.expectedReward));
          expect(event.args.newBonded).to.be.bignumber.equal(
            new BN(
              this.expectedReward * 2,
            ),
          );
        });
      });
    });

    describe("(3) - above limit (price 1.05), business as usual", function () {
      beforeEach(async function () {
        await this.regulator.incrementEpochE(); // 1

        await this.regulator.incrementTotalBondedE(1000000);
        await this.regulator.mintToE(this.regulator.address, 1000000);

        await this.regulator.mintToE(userAddress, new BN(100000));
        await this.dollar.approve(this.regulator.address, new BN(100000), { from: userAddress });

        await this.cdsd.approve(this.regulator.address, 5000, {
          from: userAddress,
        });
        await this.regulator.setCurrentInterestMultiplier(userAddress);

        await this.regulator.burnDSDForCDSDAndBond(new BN(100000), { from: userAddress });

        await this.regulator.incrementEpochE(); // 2
      });

      describe("on step", function () {
        beforeEach(async function () {
          await this.oracle.set(105, 100, true);
          this.expectedReward = 760;

          this.expectedRedeemableCDSDForDSD = 100000 * 2;

          this.expectedRewardTreasure = 60

          this.result = await this.regulator.stepE();
          this.txHash = this.result.tx;
        });

        it("mints new Dollar tokens", async function () {
          expect(await this.dollar.totalSupply()).to.be.bignumber.equal(
            new BN(1000000).add(new BN(this.expectedReward)),
          );

          expect(await this.cdsd.totalSupply()).to.be.bignumber.equal(
            new BN(100000), // no cDSD was minted during expansion
          );
          expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(
            new BN(1000000)
          );

          expect(await this.dollar.balanceOf(await this.regulator.treasuryE())).to.be.bignumber.equal(
            new BN(this.expectedRewardTreasure),
          );
        });

        it("updates totals", async function () {
          expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
            new BN(1000000)
          );

          expect(await this.regulator.totalCDSDRedeemable()).to.be.bignumber.equal(
            new BN(this.expectedRedeemableCDSDForDSD),
          );
        });

        it("emits SupplyIncrease event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "SupplyIncrease", {});

          expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
          expect(event.args.price).to.be.bignumber.equal(new BN(105).mul(new BN(10).pow(new BN(16))));
          expect(event.args.newRedeemable).to.be.bignumber.equal(new BN(this.expectedRedeemableCDSDForDSD));
          expect(event.args.newBonded).to.be.bignumber.equal(
            new BN(
              this.expectedReward +
                this.expectedRedeemableCDSDForDSD,
            ),
          );
        });
      });
    });

    describe("down regulation", function () {
      describe("under limit, no DSD burned", function () {
        beforeEach(async function () {
          await this.regulator.incrementEpochE(); // 1
          await this.regulator.incrementEpochE(); // 2

          await this.regulator.incrementTotalBondedE(1000000);
          await this.regulator.mintToE(this.regulator.address, 1000000);

          await this.regulator.incrementEpochE(); // 3
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(85, 100, true);
            this.expectedDSDContraction = 51;

            this.result = await this.regulator.stepE();
            this.txHash = this.result.tx;
          });

          it("mints new Dollar for bonded tokens", async function () {
            expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));

            expect(await this.cdsd.totalSupply()).to.be.bignumber.equal(new BN(0));

            expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedDSDContraction)),
            );
            expect(await this.regulator.totalCDSDBonded()).to.be.bignumber.equal(
              new BN(0),
            );
            expect(await this.regulator.totalCDSDDeposited()).to.be.bignumber.equal(
              new BN(0)
            );
            expect(await this.regulator.totalCDSDEarnable()).to.be.bignumber.equal(
              new BN(0)
            );
            expect(await this.regulator.totalCDSDRedeemable()).to.be.bignumber.equal(new BN(0));
          });

          it("emits ContractionIncentives event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "ContractionIncentives", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(8));
            expect(event.args.price).to.be.bignumber.equal(new BN(85).mul(new BN(10).pow(new BN(16))));
            expect(event.args.delta).to.be.bignumber.equal(new BN(51));
          });
        });
      });

      describe("bonded DSD, with some burned DSD but no bonded CDSD", function () {
        beforeEach(async function () {
          await this.regulator.incrementEpochE(); // 1

          await this.regulator.incrementTotalBondedE(1000000);
          await this.regulator.mintToE(this.regulator.address, 1000000);

          await this.regulator.mintToE(userAddress, new BN(100));
          await this.dollar.approve(this.regulator.address, new BN(100), {
            from: userAddress,
          });
          await this.cdsd.approve(this.regulator.address, 5000, {
            from: userAddress,
          });
          await this.regulator.setCurrentInterestMultiplier(userAddress);

          await this.regulator.burnDSDForCDSD(new BN(100), { from: userAddress });

          await this.regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(99, 100, true);
            this.expectedDSDContraction = 51;

            this.result = await this.regulator.stepE();
            this.txHash = this.result.tx;
          });

          it("mints new Dollar for bonded tokens", async function () {
            expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));

            expect(await this.cdsd.totalSupply()).to.be.bignumber.equal(new BN(100));
            expect(await this.cdsd.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(0));
            expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(100)); // value of burned DSD == value of CDSD

            expect(await this.regulator.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(0));

            expect(await this.regulator.redeemedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(100));
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedDSDContraction)),
            );
            expect(await this.regulator.totalCDSDBonded()).to.be.bignumber.equal(
              new BN(0)
            )
            expect(await this.regulator.totalCDSDDeposited()).to.be.bignumber.equal(
              new BN(0)
            );
            expect(await this.regulator.totalCDSDEarnable()).to.be.bignumber.equal(
              new BN(100)
            );
            expect(await this.regulator.totalCDSDRedeemable()).to.be.bignumber.equal(new BN(0));
          });

          it("emits ContractionIncentives event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "ContractionIncentives", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
            expect(event.args.price).to.be.bignumber.equal(new BN(99).mul(new BN(10).pow(new BN(16))));
            expect(event.args.delta).to.be.bignumber.equal(new BN(51));
          });
        });
      });

      describe("bonded DSD, with some burned DSD AND bonded CDSD", function () {
        beforeEach(async function () {
          await this.regulator.incrementEpochE(); // 1

          await this.regulator.incrementTotalBondedE(1000000);
          await this.regulator.mintToE(this.regulator.address, 1000000);

          await this.regulator.mintToE(userAddress, new BN(100));
          await this.dollar.approve(this.regulator.address, new BN(100), {
            from: userAddress,
          });

          await this.cdsd.approve(this.regulator.address, 5000, {
            from: userAddress,
          });
          await this.regulator.setCurrentInterestMultiplier(userAddress);

          await this.regulator.burnDSDForCDSDAndBond(new BN(100), { from: userAddress });

          await this.regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(99, 100, true);
            this.expectedDSDContraction = 51;

            this.result = await this.regulator.stepE();
            this.txHash = this.result.tx;
          });

          it("mints new Dollar for bonded tokens", async function () {
            expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));

            expect(await this.cdsd.totalSupply()).to.be.bignumber.equal(new BN(100));
            expect(await this.cdsd.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(100)); // burned + 100% of burned
            expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0)); // value is bonded to DAO

            expect(await this.regulator.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(100));
            expect(await this.regulator.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(100));
            expect(await this.regulator.redeemedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(100));
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedDSDContraction)),
            );
            expect(await this.regulator.totalCDSDBonded()).to.be.bignumber.equal(
              new BN(100), // same as this.cdsd.balanceOf(this.regulator.address)
            );
            expect(await this.regulator.totalCDSDDeposited()).to.be.bignumber.equal(
              new BN(100)
            );
            expect(await this.regulator.totalCDSDEarnable()).to.be.bignumber.equal(
              new BN(100)
            );
            expect(await this.regulator.totalCDSDRedeemable()).to.be.bignumber.equal(new BN(0));
          });

          it("emits ContractionIncentives event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "ContractionIncentives", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
            expect(event.args.price).to.be.bignumber.equal(new BN(99).mul(new BN(10).pow(new BN(16))));
            expect(event.args.delta).to.be.bignumber.equal(new BN(51));
          });
        });
      });

      describe("price under (0.95), business as usual", function () {
        beforeEach(async function () {
          await this.regulator.incrementEpochE(); // 1

          await this.regulator.incrementTotalBondedE(1000000);
          await this.regulator.mintToE(this.regulator.address, 1000000);

          await this.regulator.mintToE(userAddress, new BN(1000));
          await this.dollar.approve(this.regulator.address, new BN(1000), {
            from: userAddress,
          });

          await this.cdsd.approve(this.regulator.address, 5000, {
            from: userAddress,
          });
          await this.regulator.setCurrentInterestMultiplier(userAddress);

          await this.regulator.burnDSDForCDSDAndBond(new BN(1000), { from: userAddress });

          await this.regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(95, 100, true);
            this.expectedDSDContraction = 51;

            this.result = await this.regulator.stepE();
            this.txHash = this.result.tx;
          });

          it("mints new Dollar for bonded tokens", async function () {
            expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));

            expect(await this.cdsd.totalSupply()).to.be.bignumber.equal(new BN(1000));
            expect(await this.cdsd.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(1000)); // burned + 100% of burned
            expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0)); // value is bonded to DAO

            expect(await this.regulator.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(1000));
            expect(await this.regulator.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));

            expect(await this.regulator.redeemedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000)); // 100% of what was burned
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedDSDContraction)),
            );
            expect(await this.regulator.totalCDSDBonded()).to.be.bignumber.equal(
              new BN(1000)
            );
            expect(await this.regulator.totalCDSDDeposited()).to.be.bignumber.equal(
              new BN(1000)
            );
            expect(await this.regulator.totalCDSDEarnable()).to.be.bignumber.equal(
              new BN(1000)
            );
            expect(await this.regulator.totalCDSDRedeemable()).to.be.bignumber.equal(new BN(0));
          });

          it("emits ContractionIncentives event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "ContractionIncentives", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
            expect(event.args.price).to.be.bignumber.equal(new BN(95).mul(new BN(10).pow(new BN(16))));
            expect(event.args.delta).to.be.bignumber.equal(new BN(51));
          });
        });
      });

      describe("price under (0.95), multiple buyers business as usual", function () {
        beforeEach(async function () {
          await this.regulator.incrementEpochE(); // 1

          await this.regulator.incrementTotalBondedE(1000000);
          await this.regulator.mintToE(this.regulator.address, 1000000);

          // user0
          await this.regulator.mintToE(userAddress, new BN(1000));
          await this.dollar.approve(this.regulator.address, new BN(500), {
            from: userAddress,
          });
          await this.cdsd.approve(this.regulator.address, 5000, {
            from: userAddress,
          });
          await this.regulator.setCurrentInterestMultiplier(userAddress);

          await this.cdsd.approve(this.regulator.address, 5000, {
            from: userAddress1,
          });
          await this.regulator.setCurrentInterestMultiplier(userAddress1);

          await this.cdsd.approve(this.regulator.address, 5000, {
            from: userAddress2,
          });
          await this.regulator.setCurrentInterestMultiplier(userAddress2);

          await this.regulator.burnDSDForCDSDAndBond(new BN(500), { from: userAddress });
          // user1
          await this.regulator.mintToE(userAddress1, new BN(100));
          await this.dollar.approve(this.regulator.address, new BN(100), {
            from: userAddress1,
          });
          await this.regulator.burnDSDForCDSDAndBond(new BN(100), { from: userAddress1 });
          // user2
          await this.regulator.mintToE(userAddress2, new BN(400));
          await this.dollar.approve(this.regulator.address, new BN(400), {
            from: userAddress2,
          });
          await this.regulator.burnDSDForCDSD(new BN(200), { from: userAddress2 }); // only burning
          await this.regulator.burnDSDForCDSDAndBond(new BN(200), { from: userAddress2 });

          await this.regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(95, 100, true);
            this.expectedDSDContraction = 51;
            this.cdsdCreatedFromBurnedDSD = 500 + 51;
            this.cdsdCreatedFromBurnedDSDAndBonded = 500 + 100 + 200;

            this.result = await this.regulator.stepE();
            this.txHash = this.result.tx;
          });

          it("mints new Dollar for bonded tokens", async function () {
            expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(1000000).add(new BN(this.cdsdCreatedFromBurnedDSD)));
            expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction))); // userAddress burned 500 of his DSD, leaving 500 freefloating
            expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(500)); // only burned and 500
            expect(await this.dollar.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(0));
            expect(await this.dollar.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(0));

            expect(await this.cdsd.totalSupply()).to.be.bignumber.equal(new BN(1000));
            expect(await this.cdsd.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(this.cdsdCreatedFromBurnedDSDAndBonded));
            expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0)); // value is bonded to DAO
            expect(await this.cdsd.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(0)); // value is bonded to DAO
            expect(await this.cdsd.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(200)); // burned 400 and bonded 200; still 200 in wallet

            expect(await this.regulator.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(500));
            expect(await this.regulator.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(500));

            expect(await this.regulator.redeemedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(500));


            expect(await this.regulator.balanceOfCDSDBonded(userAddress1)).to.be.bignumber.equal(new BN(100));
            expect(await this.regulator.depositedCDSDByAccount(userAddress1)).to.be.bignumber.equal(new BN(100));

            expect(await this.regulator.redeemedCDSDByAccount(userAddress1)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.earnableCDSDByAccount(userAddress1)).to.be.bignumber.equal(new BN(100));

            expect(await this.regulator.balanceOfCDSDBonded(userAddress2)).to.be.bignumber.equal(new BN(200)); // burned 400 but bonded 200
            expect(await this.regulator.depositedCDSDByAccount(userAddress2)).to.be.bignumber.equal(new BN(200));

            expect(await this.regulator.redeemedCDSDByAccount(userAddress2)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.earnableCDSDByAccount(userAddress2)).to.be.bignumber.equal(new BN(400));
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedDSDContraction)),
            );
            expect(await this.regulator.totalCDSDBonded()).to.be.bignumber.equal(
              new BN(this.cdsdCreatedFromBurnedDSDAndBonded),
            );
            expect(await this.regulator.totalCDSDDeposited()).to.be.bignumber.equal(
              new BN(this.cdsdCreatedFromBurnedDSDAndBonded)
            );
            expect(await this.regulator.totalCDSDEarnable()).to.be.bignumber.equal(
              new BN(1000)
            );
            expect(await this.regulator.totalCDSDRedeemable()).to.be.bignumber.equal(new BN(0));
          });

          it("emits ContractionIncentives event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "ContractionIncentives", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
            expect(event.args.price).to.be.bignumber.equal(new BN(95).mul(new BN(10).pow(new BN(16))));
            expect(event.args.delta).to.be.bignumber.equal(new BN(this.expectedDSDContraction));
          });
        });
      });
    });

    describe("neutral regulation", function () {
      beforeEach(async function () {
        await this.regulator.incrementEpochE(); // 1

        await this.regulator.incrementTotalBondedE(1000000);
        await this.regulator.mintToE(this.regulator.address, 1000000);

        await this.regulator.incrementEpochE(); // 2
      });

      describe("on step", function () {
        beforeEach(async function () {
          await this.oracle.set(100, 100, true);
          this.result = await this.regulator.stepE();
          this.txHash = this.result.tx;
        });

        it("doesnt mint new Dollar tokens", async function () {
          expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(1000000));
          expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(1000000));
          expect(await this.dollar.balanceOf(poolAddress)).to.be.bignumber.equal(new BN(0));
        });

        it("updates totals", async function () {
          expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalBonded()).to.be.bignumber.equal(new BN(1000000));
          expect(await this.regulator.totalDebt()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalSupply()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalCoupons()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalRedeemable()).to.be.bignumber.equal(new BN(0));
        });

        it("emits SupplyNeutral event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "SupplyNeutral", {});

          expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
        });
      });
    });

    describe("not valid", function () {
      beforeEach(async function () {
        await this.regulator.incrementEpochE(); // 1

        await this.regulator.incrementTotalBondedE(1000000);
        await this.regulator.mintToE(this.regulator.address, 1000000);

        await this.regulator.incrementEpochE(); // 2
      });

      describe("on step", function () {
        beforeEach(async function () {
          await this.oracle.set(105, 100, false);
          this.result = await this.regulator.stepE();
          this.txHash = this.result.tx;
        });

        it("doesnt mint new Dollar tokens", async function () {
          expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(1000000));
          expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(1000000));
          expect(await this.dollar.balanceOf(poolAddress)).to.be.bignumber.equal(new BN(0));
        });

        it("updates totals", async function () {
          expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalBonded()).to.be.bignumber.equal(new BN(1000000));
          expect(await this.regulator.totalDebt()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalSupply()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalCoupons()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalRedeemable()).to.be.bignumber.equal(new BN(0));
        });

        it("emits SupplyNeutral event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "SupplyNeutral", {});

          expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
        });
      });
    });
  });
});

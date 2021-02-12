const { accounts, contract } = require("@openzeppelin/test-environment");

const { BN, expectEvent } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");

const MockRegulator = contract.fromArtifact("MockRegulator");
const MockSettableOracle = contract.fromArtifact("MockSettableOracle");
const Dollar = contract.fromArtifact("Dollar");

const POOL_REWARD_PERCENT = 40;
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
  const [ownerAddress, userAddress, poolAddress] = accounts;

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
            expect(await this.dollar.balanceOf(poolAddress)).to.be.bignumber.equal(poolIncentive(this.expectedReward));
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
            expect(await this.dollar.balanceOf(poolAddress)).to.be.bignumber.equal(poolIncentive(this.expectedReward));
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
          await this.regulator.burnDSDForCDSDAndBond(new BN(100000), { from: userAddress });

          await this.regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(101, 100, true);
            this.expectedReward = 360;
            this.expectedRedeemableCDSDForDSD = this.expectedReward * 0.5; // 50% goes to cDSD bond holders to redeem their tokens for DSD
            this.expectedRewardLP = this.expectedReward * 0.4; // 40%
            this.expectedRewardTreasure = this.expectedReward * 0.03; // 3%
            this.expectedRewardDAO =
              this.expectedReward -
              this.expectedRewardLP -
              this.expectedRewardTreasure -
              this.expectedRedeemableCDSDForDSD +
              1; // +1 for small correction of JS work with decimals

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
              new BN(1000000).add(
                new BN(this.expectedReward - this.expectedRewardLP - this.expectedRewardTreasure + 1),
              ),
            );
            expect(await this.dollar.balanceOf(poolAddress)).to.be.bignumber.equal(new BN(this.expectedRewardLP));

            expect(await this.dollar.balanceOf(await this.regulator.treasuryE())).to.be.bignumber.equal(
              new BN(this.expectedRewardTreasure),
            );
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedRewardDAO)),
            );

            expect(await this.regulator.dip10TotalRedeemable()).to.be.bignumber.equal(
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
                this.expectedRewardLP +
                  this.expectedRewardDAO +
                  this.expectedRewardTreasure +
                  this.expectedRedeemableCDSDForDSD -
                  1,
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
        await this.regulator.burnDSDForCDSDAndBond(new BN(10), { from: userAddress });

        await this.regulator.incrementEpochE(); // 2
      });

      describe("on step", function () {
        beforeEach(async function () {
          await this.oracle.set(101, 100, true);
          this.expectedReward = 399;
          this.poolReward = this.expectedReward * 0.4; // 40%;
          this.treasureReward = this.expectedReward * 0.03; // 3%
          this.expectedRedeemableCDSDForDSD = 20; // covers entire burned DSD plus 100% of possible earnings

          this.expectedRewardDAO =
            this.expectedReward - this.poolReward - this.treasureReward - this.expectedRedeemableCDSDForDSD + 2;

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
          expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(
            new BN(1000000).add(new BN(this.expectedReward - this.poolReward - this.treasureReward + 2)),
          );

          expect(await this.dollar.balanceOf(poolAddress)).to.be.bignumber.equal(new BN(this.poolReward));

          expect(await this.dollar.balanceOf(await this.regulator.treasuryE())).to.be.bignumber.equal(
            new BN(this.treasureReward),
          );
        });

        it("updates totals", async function () {
          expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
            new BN(1000000).add(new BN(this.expectedRewardDAO)),
          );

          expect(await this.regulator.dip10TotalRedeemable()).to.be.bignumber.equal(
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
              this.poolReward + this.expectedRewardDAO + this.treasureReward + this.expectedRedeemableCDSDForDSD - 2,
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
        await this.regulator.burnDSDForCDSDAndBond(new BN(100000), { from: userAddress });

        await this.regulator.incrementEpochE(); // 2
      });

      describe("on step", function () {
        beforeEach(async function () {
          await this.oracle.set(105, 100, true);
          this.expectedReward = 1800;

          this.expectedRedeemableCDSDForDSD = this.expectedReward * 0.5; // 50% goes to cDSD bond holders to redeem their tokens for DSD
          this.expectedRewardLP = this.expectedReward * 0.4; // 40%
          this.expectedRewardTreasure = this.expectedReward * 0.03; // 3%
          this.expectedRewardDAO =
            this.expectedReward -
            this.expectedRewardLP -
            this.expectedRewardTreasure -
            this.expectedRedeemableCDSDForDSD;

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
            new BN(1000000).add(new BN(this.expectedReward - this.expectedRewardLP - this.expectedRewardTreasure)),
          );
          expect(await this.dollar.balanceOf(poolAddress)).to.be.bignumber.equal(new BN(this.expectedRewardLP));

          expect(await this.dollar.balanceOf(await this.regulator.treasuryE())).to.be.bignumber.equal(
            new BN(this.expectedRewardTreasure),
          );
        });

        it("updates totals", async function () {
          expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
          expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
            new BN(1000000).add(new BN(this.expectedRewardDAO)),
          );

          expect(await this.regulator.dip10TotalRedeemable()).to.be.bignumber.equal(
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
              this.expectedRewardLP +
                this.expectedRewardDAO +
                this.expectedRewardTreasure +
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
            this.expectedDSDContraction = 500;

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
            expect(await this.regulator.totalCDSDShares()).to.be.bignumber.equal(
              new BN(0)
            );
            expect(await this.regulator.totalBurnedDSD()).to.be.bignumber.equal(
              new BN(0)
            );
            expect(await this.regulator.dip10TotalRedeemable()).to.be.bignumber.equal(new BN(0));
          });

          it("emits CDSDSupplyIncrease event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "CDSDSupplyIncrease", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(8));
            expect(event.args.price).to.be.bignumber.equal(new BN(85).mul(new BN(10).pow(new BN(16))));
            expect(event.args.newCDSDSupply).to.be.bignumber.equal(new BN(0));
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
          await this.regulator.burnDSDForCDSD(new BN(100), { from: userAddress });

          await this.regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(99, 100, true);
            this.expectedDSDContraction = 100;

            this.result = await this.regulator.stepE();
            this.txHash = this.result.tx;
          });

          it("mints new Dollar for bonded tokens", async function () {
            expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));

            expect(await this.cdsd.totalSupply()).to.be.bignumber.equal(new BN(200));
            expect(await this.cdsd.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(100)); // 100% of what was burned
            expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(100)); // value of burned DSD == value of CDSD

            expect(await this.regulator.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(100));
            expect(await this.regulator.balanceOfRedeemedCDSD(userAddress)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.balanceOfEarnableCDSD(userAddress)).to.be.bignumber.equal(new BN(200)); // 100% of what was burned
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedDSDContraction)),
            );
            expect(await this.regulator.totalCDSDBonded()).to.be.bignumber.equal(
              new BN(100), // same as this.cdsd.balanceOf(this.regulator.address)
            );
            expect(await this.regulator.totalCDSDShares()).to.be.bignumber.equal(
              new BN(0)
            );
            expect(await this.regulator.totalBurnedDSD()).to.be.bignumber.equal(
              new BN(100)
            );
            expect(await this.regulator.dip10TotalRedeemable()).to.be.bignumber.equal(new BN(0));
          });

          it("emits CDSDSupplyIncrease event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "CDSDSupplyIncrease", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
            expect(event.args.price).to.be.bignumber.equal(new BN(99).mul(new BN(10).pow(new BN(16))));
            expect(event.args.newCDSDSupply).to.be.bignumber.equal(new BN(100));
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
          await this.regulator.burnDSDForCDSDAndBond(new BN(100), { from: userAddress });

          await this.regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(99, 100, true);
            this.expectedDSDContraction = 100;

            this.result = await this.regulator.stepE();
            this.txHash = this.result.tx;
          });

          it("mints new Dollar for bonded tokens", async function () {
            expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));

            expect(await this.cdsd.totalSupply()).to.be.bignumber.equal(new BN(200));
            expect(await this.cdsd.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(200)); // burned + 100% of burned
            expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0)); // value is bonded to DAO

            expect(await this.regulator.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(200));
            expect(await this.regulator.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(100));
            expect(await this.regulator.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(100));
            expect(await this.regulator.balanceOfRedeemedCDSD(userAddress)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.balanceOfEarnableCDSD(userAddress)).to.be.bignumber.equal(new BN(200)); // 100% of what was burned
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedDSDContraction)),
            );
            expect(await this.regulator.totalCDSDBonded()).to.be.bignumber.equal(
              new BN(200), // same as this.cdsd.balanceOf(this.regulator.address)
            );
            expect(await this.regulator.totalCDSDShares()).to.be.bignumber.equal(
              new BN(100)
            );
            expect(await this.regulator.totalBurnedDSD()).to.be.bignumber.equal(
              new BN(100)
            );
            expect(await this.regulator.dip10TotalRedeemable()).to.be.bignumber.equal(new BN(0));
          });

          it("emits CDSDSupplyIncrease event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "CDSDSupplyIncrease", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
            expect(event.args.price).to.be.bignumber.equal(new BN(99).mul(new BN(10).pow(new BN(16))));
            expect(event.args.newCDSDSupply).to.be.bignumber.equal(new BN(100));
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
          await this.regulator.burnDSDForCDSDAndBond(new BN(1000), { from: userAddress });

          await this.regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          beforeEach(async function () {
            await this.oracle.set(95, 100, true);
            this.expectedDSDContraction = 500;

            this.result = await this.regulator.stepE();
            this.txHash = this.result.tx;
          });

          it("mints new Dollar for bonded tokens", async function () {
            expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(1000000).add(new BN(this.expectedDSDContraction)));
            expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));

            expect(await this.cdsd.totalSupply()).to.be.bignumber.equal(new BN(2000));
            expect(await this.cdsd.balanceOf(this.regulator.address)).to.be.bignumber.equal(new BN(2000)); // burned + 100% of burned
            expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0)); // value is bonded to DAO

            expect(await this.regulator.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(2000));
            expect(await this.regulator.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(1000));
            expect(await this.regulator.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(1000));
            expect(await this.regulator.balanceOfRedeemedCDSD(userAddress)).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.balanceOfEarnableCDSD(userAddress)).to.be.bignumber.equal(new BN(2000)); // 100% of what was burned
          });

          it("updates totals", async function () {
            expect(await this.regulator.totalStaged()).to.be.bignumber.equal(new BN(0));
            expect(await this.regulator.totalBonded()).to.be.bignumber.equal(
              new BN(1000000).add(new BN(this.expectedDSDContraction)),
            );
            expect(await this.regulator.totalCDSDBonded()).to.be.bignumber.equal(
              new BN(2000), // same as this.cdsd.balanceOf(this.regulator.address)
            );
            expect(await this.regulator.totalCDSDShares()).to.be.bignumber.equal(
              new BN(1000)
            );
            expect(await this.regulator.totalBurnedDSD()).to.be.bignumber.equal(
              new BN(1000)
            );
            expect(await this.regulator.dip10TotalRedeemable()).to.be.bignumber.equal(new BN(0));
          });

          it("emits CDSDSupplyIncrease event", async function () {
            const event = await expectEvent.inTransaction(this.txHash, MockRegulator, "CDSDSupplyIncrease", {});

            expect(event.args.epoch).to.be.bignumber.equal(new BN(7));
            expect(event.args.price).to.be.bignumber.equal(new BN(95).mul(new BN(10).pow(new BN(16))));
            expect(event.args.newCDSDSupply).to.be.bignumber.equal(new BN(1000));
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

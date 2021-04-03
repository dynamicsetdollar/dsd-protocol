const { accounts, contract } = require("@openzeppelin/test-environment");

const { BN, expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");

const MockCDSDMarket = contract.fromArtifact("MockCDSDMarket");
const Dollar = contract.fromArtifact("Dollar");
const ContractionDollar = contract.fromArtifact("ContractionDollar");

describe("CDSDMarket", function () {
  const [ownerAddress, userAddress, poolAddress, userAddress1, userAddress2] = accounts;
  const initialUserDSDBalance = new BN(1000000);

  beforeEach(async function () {
    this.market = await MockCDSDMarket.new(poolAddress, {
      from: ownerAddress,
      gas: 8000000,
    });
    this.dollar = await Dollar.at(await this.market.dollar());
    this.cdsd = await ContractionDollar.at(await this.market.cdsd());

    await this.market.incrementEpochE();
    await this.market.mintToE(userAddress, initialUserDSDBalance);
    await this.dollar.approve(this.market.address, initialUserDSDBalance, {
      from: userAddress,
    });
  });

  describe("burnDSDForCDSD", function () {
    describe("when price is above 1", function () {
      it("reverts", async function () {
        await this.market.justMintCDSDToE(userAddress, 1000, {
          from: ownerAddress,
        });

        await this.market.setPriceE(110, 100);

        await expectRevert(this.market.burnDSDForCDSD(new BN(1000), { from: userAddress }), "Market: not in contraction");
      });
    });

    describe("when burning DSD", function () {
      beforeEach(async function () {
        await this.market.mintToE(userAddress, 1000); // added to initial balance
        await this.dollar.approve(this.market.address, 1000, {
          from: userAddress,
        });

        await this.market.setPriceE(91, 100);

        this.result = await this.market.burnDSDForCDSD(1000, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(initialUserDSDBalance); // after burning only the initial balance remains
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(1000));
        expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(0)); // user has not deposited

        expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(0));
        expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(1000));
      });

      it("emits CDSDMinted event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "CDSDMinted", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.amount).to.be.bignumber.equal(new BN(1000));
      });
    });
  });

  describe("migrateCouponsToCDSD", function () {
    describe("when burning coupons", function () {
      beforeEach(async function () {
        const couponEpoch = 1;

        await this.market.incrementBalanceOfCouponsE(userAddress, couponEpoch, 1000);
        await this.market.incrementBalanceOfCouponUnderlyingE(userAddress, couponEpoch, 1000);

        // await this.market.setPriceE(91, 100);

        this.result = await this.market.migrateCouponsToCDSD(couponEpoch, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(2000));
        expect(await this.market.balanceOfCoupons(userAddress, 1)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCouponUnderlying(userAddress, 1)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(0)); // user has not deposited/bonded
        expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(0));
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCoupons()).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCouponUnderlying()).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(0));
      });

      it("emits CDSDMinted event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "CDSDMinted", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.amount).to.be.bignumber.equal(new BN(2000));
      });
    });
  });

  describe("burnDSDForCDSDAndBond", function () {
    describe("when burning DSD plus bonding cDSD", function () {
      beforeEach(async function () {
        await this.market.mintToE(userAddress, 1000); // added to initial balance
        await this.dollar.approve(this.market.address, 1000, {
          from: userAddress,
        });
        await this.cdsd.approve(this.market.address, 1000, {
          from: userAddress,
        });

        await this.market.setCurrentInterestMultiplier(userAddress);

        this.result = await this.market.burnDSDForCDSDAndBond(1000, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(initialUserDSDBalance); // after burning only the initial balance remains
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000)); // user shares of bonded cDSD
        expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(1000));

        expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(1000));
        expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(1000));
      });

      it("emits CDSDMinted event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "CDSDMinted", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.amount).to.be.bignumber.equal(new BN(1000));
      });

      it("emits BondCDSD event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "BondCDSD", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.start).to.be.bignumber.equal(new BN(2));
        expect(event.args.amount).to.be.bignumber.equal(new BN(1000));
      });
    });
  });

  describe("migrateCouponsToCDSDAndBond", function () {
    describe("when burning coupons plus bonding cDSD", function () {
      beforeEach(async function () {
        const couponEpoch = 1;

        await this.market.incrementBalanceOfCouponsE(userAddress, couponEpoch, 1000);
        await this.market.incrementBalanceOfCouponUnderlyingE(userAddress, couponEpoch, 1000);

        await this.cdsd.approve(this.market.address, 2000, {
          from: userAddress,
        });
        await this.market.setCurrentInterestMultiplier(userAddress);


        this.result = await this.market.migrateCouponsToCDSDAndBond(couponEpoch, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCoupons(userAddress, 1)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCouponUnderlying(userAddress, 1)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(2000)); // user  shares of bonded cDSD
        expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(0));
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(2000));

        expect(await this.market.totalCoupons()).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCouponUnderlying()).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(2000));
        expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(0));
      });

      it("emits CDSDMinted event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "CDSDMinted", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.amount).to.be.bignumber.equal(new BN(2000));
      });

      it("emits BondCDSD event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "BondCDSD", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.start).to.be.bignumber.equal(new BN(2));
        expect(event.args.amount).to.be.bignumber.equal(new BN(2000));
      });
    });
  });

  describe("bondCDSD", function () {
    describe("calls that reverts", function () {
      beforeEach(async function () {
        await this.cdsd.approve(this.market.address, 5000, {
          from: userAddress,
        });
        await this.market.setCurrentInterestMultiplier(userAddress);

        await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress, 1000, {
          from: userAddress,
        });

        await this.market.incrementEpochE({ from: userAddress });
      });


      it("cannot have no amount", async function () {
        await expectRevert(
          this.market.bondCDSD(new BN(0), { from: userAddress }),
          "Market: bound must be greater than 0",
        );
      });
    });

    describe("when user simply bonds cDSD", function () {
      beforeEach(async function () {
        await this.cdsd.approve(this.market.address, 5000, {
          from: userAddress,
        });
        await this.market.setCurrentInterestMultiplier(userAddress);

        await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress, 1000, {
          from: userAddress,
        });

        this.result = await this.market.bondCDSD(1000, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000)); // user bonded cDSD
        expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(1000));

        expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(1000));
        expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(1000));
      });

      it("emits BondCDSD event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "BondCDSD", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.start).to.be.bignumber.equal(new BN(2));
        expect(event.args.amount).to.be.bignumber.equal(new BN(1000));
      });
    });

    describe("when user partially bonds", function () {
      beforeEach(async function () {
        await this.cdsd.approve(this.market.address, 5000, {
          from: userAddress,
        });
        await this.market.setCurrentInterestMultiplier(userAddress);
        await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress, 1000, {
          from: userAddress,
        });

        this.result = await this.market.bondCDSD(300, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(700));
        expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(300)); // user bonded cDSD
        expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));
      });

      it("updates dao balances", async function () {
        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(300));
        expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(300));
        expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(1000));
      });

      it("emits BondCDSD event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "BondCDSD", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.start).to.be.bignumber.equal(new BN(2));
        expect(event.args.amount).to.be.bignumber.equal(new BN(300));
      });
    });

    describe("multiple users bond their cDSD", function () {
      beforeEach(async function () {
        await this.cdsd.approve(this.market.address, 5000, {
          from: userAddress,
        });
        await this.market.setCurrentInterestMultiplier(userAddress);
        await this.cdsd.approve(this.market.address, 5000, {
          from: userAddress1,
        });
        await this.market.setCurrentInterestMultiplier(userAddress1);
        await this.cdsd.approve(this.market.address, 5000, {
          from: userAddress2,
        });
        await this.market.setCurrentInterestMultiplier(userAddress2);

        await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress1, 1000);
        await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress2, 1000);

        await this.market.bondCDSD(600, { from: userAddress1 });

        await this.market.bondCDSD(400, { from: userAddress2 });

        await this.market.incrementEpochE({ from: userAddress });

        await this.market.mintCDSDAndIncreaseDSDBurnedE(this.market.address, 1000);

        await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress, 1000);
        this.result = await this.market.bondCDSD(500, {
          from: userAddress,
        });

        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(initialUserDSDBalance));

        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(
          new BN(500), // total of shares
        );

        expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(500)); // user shares of bonded cDSD
        expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));
      });

      it("updates dao balances", async function () {
        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(
          new BN(600).add(new BN(400)).add(new BN(1000)).add(new BN(500)),
        );

        expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(1500));
        expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(4000));
      });

      it("emits BondCDSD event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "BondCDSD", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.start).to.be.bignumber.equal(new BN(3));
        expect(event.args.amount).to.be.bignumber.equal(new BN(500));
      });
    });
  });

  describe("unbondCDSD", function () {
    describe("calls that reverts", function () {
      describe("when nothing bonded", function () {
        it("reverts", async function () {
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress,
          });
          await this.market.setCurrentInterestMultiplier(userAddress);
          await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress, 1000, {
            from: userAddress,
          });

          await expectRevert(this.market.unbondCDSD(new BN(1000), { from: userAddress }), "Market: amounts > 0!");
        });
      });

      describe("when bonded", function () {
        beforeEach(async function () {
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress,
          });
          await this.market.setCurrentInterestMultiplier(userAddress);
          await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress, 1000, {
            from: userAddress,
          });

          await this.market.bondCDSD(1000, {
            from: userAddress,
          });

          await this.market.incrementEpochE({ from: userAddress });
        });

        it("cannot unbound more amount than owned", async function () {
          await expectRevert(
            this.market.unbondCDSD(new BN(1500), { from: userAddress }),
            "Market: insufficient amount to unbound",
          );
        });

        it("cannot have no amount", async function () {
          await expectRevert(this.market.unbondCDSD(new BN(0), { from: userAddress }), "Market: amounts > 0!");
        });
      });
    });

    describe("when unbonding cdsd", function () {
      beforeEach(async function () {
        await this.cdsd.approve(this.market.address, 5000, {
          from: userAddress,
        });
        await this.market.setCurrentInterestMultiplier(userAddress);
        await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress, 1000, {
          from: userAddress,
        });

        await this.market.bondCDSD(1000, {
          from: userAddress,
        });

        await this.market.incrementEpochE({ from: userAddress });
      });

      describe("simple", function () {
        beforeEach(async function () {
          this.result = await this.market.unbondCDSD(new BN(1000), { from: userAddress });
          this.txHash = this.result.tx;
        });

        it("updates users balances", async function () {
          expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(1000));
          expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(0));

          expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));
        });

        it("updates dao balances", async function () {
          expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));
          expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(0));
          expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(1000));
        });

        it("emits UnbondCDSD event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "UnbondCDSD", {
            account: userAddress,
          });

          expect(event.args.account).to.be.bignumber.equal(userAddress);
          expect(event.args.start).to.be.bignumber.equal(new BN(3));
          expect(event.args.amount).to.be.bignumber.equal(new BN(1000));
        });
      });

      describe("partially unbounding", function () {
        beforeEach(async function () {
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress,
          });
          await this.market.setCurrentInterestMultiplier(userAddress);
          this.result = await this.market.unbondCDSD(new BN(800), { from: userAddress });
          this.txHash = this.result.tx;
        });

        it("updates users balances", async function () {
          expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(800));
          expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(200));

          expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));
        });

        it("updates dao balances", async function () {
          expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(200));
          expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(200));
          expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(1000));
        });

        it("emits UnbondCDSD event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "UnbondCDSD", {
            account: userAddress,
          });

          expect(event.args.account).to.be.bignumber.equal(userAddress);
          expect(event.args.start).to.be.bignumber.equal(new BN(3));
          expect(event.args.amount).to.be.bignumber.equal(new BN(800));
        });
      });

      describe("multiple", function () {
        beforeEach(async function () {
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress,
          });
          await this.market.setCurrentInterestMultiplier(userAddress);
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress1,
          });
          await this.market.setCurrentInterestMultiplier(userAddress1);
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress2,
          });
          await this.market.setCurrentInterestMultiplier(userAddress2);
          await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress1, 1000);
          await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress2, 1000);

          await this.market.bondCDSD(600, { from: userAddress1 });
          await this.market.bondCDSD(400, { from: userAddress2 });

          await this.market.incrementEpochE({ from: userAddress });

          this.result = await this.market.unbondCDSD(800, {
            from: userAddress,
          });

          this.txHash = this.result.tx;
        });

        it("updates users balances", async function () {
          expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(800));
          expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(200)); // user shares of bonded cDSD

          expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));
        });

        it("updates dao balances", async function () {
          expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(
            new BN(600).add(new BN(400)).add(new BN(1000)).sub(new BN(800)), // 800 shares was removed which equals 1200 cDSD
          );
          expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(1200));
          expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(3000));
        });

        it("emits UnbondCDSD event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "UnbondCDSD", {
            account: userAddress,
          });

          expect(event.args.account).to.be.bignumber.equal(userAddress);
          expect(event.args.start).to.be.bignumber.equal(new BN(4));
          expect(event.args.amount).to.be.bignumber.equal(new BN(800));
        });
      });
    });
  });

  describe("redeemBondedCDSDForDSD", function () {
    describe("calls that reverts", function () {
      describe("when price is under 1", function () {
        it("reverts", async function () {
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress,
          });
          await this.market.setCurrentInterestMultiplier(userAddress);
          await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress, 1000, {
            from: userAddress,
          });

          await this.market.setPriceE(91, 100);

          await expectRevert(
            this.market.redeemBondedCDSDForDSD(new BN(1000), { from: userAddress }),
            "Market: not in expansion",
          );
        });
      });

      describe("when price is above 1", function () {
        beforeEach(async function () {
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress,
          });
          await this.market.setCurrentInterestMultiplier(userAddress);
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress1,
          });
          await this.market.setCurrentInterestMultiplier(userAddress1);
          await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress, 1000, {
            from: userAddress,
          });

          await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress1, 2000, {
            from: userAddress,
          });

          await this.market.bondCDSD(1000, {
            from: userAddress,
          });
          await this.market.bondCDSD(2000, {
            from: userAddress1,
          });

          await this.market.setPriceE(111, 100);

          await this.market.incrementEpochE({ from: userAddress });
        });

        it("cannot redeem more amount than earnable", async function () {
          await expectRevert(
            this.market.redeemBondedCDSDForDSD(new BN(2500), { from: userAddress }),
            "Market: not enough redeemable",
          );
        });

        it("cannot redeem more amount than owned", async function () {
          await expectRevert(
            this.market.redeemBondedCDSDForDSD(new BN(1500), { from: userAddress }),
            "Market: not enough redeemable",
          );
        });

        it("reverts when amount is zero", async function () {
          await expectRevert(
            this.market.redeemBondedCDSDForDSD(new BN(0), { from: userAddress }),
            "Market: amounts > 0!",
          );
        });

        it("is unable to remove more than redeemable limit", async function () {
          await expectRevert(
            this.market.redeemBondedCDSDForDSD(new BN(33), { from: userAddress }), // needs to be 32 or lower
            "Market: not enough redeemable",
          );
        });
      });
    });

    describe("when redeeming cdsd for DSD", function () {
      beforeEach(async function () {
        await this.cdsd.approve(this.market.address, 5000, {
          from: userAddress,
        });
        await this.market.setCurrentInterestMultiplier(userAddress);
        await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress, 1000, {
          from: userAddress,
        });

        await this.market.bondCDSD(1000, {
          from: userAddress,
        });

        await this.market.setPriceE(111, 100);

        await this.market.incrementEpochE({ from: userAddress });
      });

      describe("partially redeeming", function () {
        beforeEach(async function () {
          await this.market.incrementTotalCDSDRedeemableE(200);

          this.balanceBeforeRedeem = await this.dollar.balanceOf(userAddress);
          this.result = await this.market.redeemBondedCDSDForDSD(new BN(10), { from: userAddress });
          this.txHash = this.result.tx;
        });

        it("updates users balances", async function () {
          expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));
          expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(
            this.balanceBeforeRedeem.add(new BN(10)),
          ); // + 10 DSD after redeemption
          expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(990));
          expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));
        });

        it("updates dao balances", async function () {
          expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(990));
          expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(990));
          expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(1000));
        });

        it("emits CDSDRedeemed event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "CDSDRedeemed", {
            account: userAddress,
          });

          expect(event.args.account).to.be.bignumber.equal(userAddress);
          expect(event.args.amount).to.be.bignumber.equal(new BN(10));
        });
      });

      describe("redeeming all", function () {
        beforeEach(async function () {
          const totalEarnable = await this.market.totalCDSDEarnable();
          await this.market.incrementTotalCDSDRedeemableE(totalEarnable);

          this.result = await this.market.redeemBondedCDSDForDSD(999, { from: userAddress });
          this.txHash = this.result.tx;
        });

        it("updates users balances", async function () {
          expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));
          expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1));
          expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));
        });

        it("updates dao balances", async function () {
          expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(1));
          expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(1));

          expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(1000));
        });

        it("emits CDSDRedeemed event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "CDSDRedeemed", {
            account: userAddress,
          });

          expect(event.args.account).to.be.bignumber.equal(userAddress);
          expect(event.args.amount).to.be.bignumber.equal(new BN(999));
        });
      });

      describe("multiple", function () {
        beforeEach(async function () {
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress,
          });
          await this.market.setCurrentInterestMultiplier(userAddress);
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress1,
          });
          await this.market.setCurrentInterestMultiplier(userAddress1);
          await this.cdsd.approve(this.market.address, 5000, {
            from: userAddress2,
          });
          await this.market.setCurrentInterestMultiplier(userAddress2);

          await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress1, 1000);
          await this.market.mintCDSDAndIncreaseDSDBurnedE(userAddress2, 1000);

          await this.market.bondCDSD(600, { from: userAddress1 });
          await this.market.bondCDSD(400, { from: userAddress2 });

          await this.market.incrementEpochE({ from: userAddress });

          await this.market.incrementTotalCDSDRedeemableE(2000);

          this.result = await this.market.redeemBondedCDSDForDSD(200, {
            from: userAddress,
          });

          this.txHash = this.result.tx;
        });

        it("updates users balances", async function () {
          expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));
          expect(await this.market.depositedCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(800)); // user shares of bonded cDSD

          expect(await this.market.earnableCDSDByAccount(userAddress)).to.be.bignumber.equal(new BN(1000));

          expect(await this.cdsd.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(400));
          expect(await this.market.depositedCDSDByAccount(userAddress1)).to.be.bignumber.equal(new BN(600)); // user shares of bonded cDSD

          expect(await this.market.earnableCDSDByAccount(userAddress1)).to.be.bignumber.equal(new BN(1000));

          expect(await this.cdsd.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(600));
          expect(await this.market.depositedCDSDByAccount(userAddress2)).to.be.bignumber.equal(new BN(400)); // user shares of bonded cDSD

          expect(await this.market.earnableCDSDByAccount(userAddress2)).to.be.bignumber.equal(new BN(1000));
        });

        it("updates dao balances", async function () {
          expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(
            new BN(600).add(new BN(400)).add(new BN(1000)).sub(new BN(200)),
          );
          expect(await this.market.totalCDSDDeposited()).to.be.bignumber.equal(new BN(1800));

          expect(await this.market.totalCDSDEarnable()).to.be.bignumber.equal(new BN(3000));
        });

        it("emits CDSDRedeemed event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockCDSDMarket, "CDSDRedeemed", {
            account: userAddress,
          });

          expect(event.args.account).to.be.bignumber.equal(userAddress);
          expect(event.args.amount).to.be.bignumber.equal(new BN(200));
        });
      });
    });
  });
});

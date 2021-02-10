const { accounts, contract } = require("@openzeppelin/test-environment");

const { BN, expectRevert, expectEvent, time } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");

const MockMarket = contract.fromArtifact("MockMarket");
const Dollar = contract.fromArtifact("Dollar");
const ContractionDollar = contract.fromArtifact("ContractionDollar");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT256 = new BN(2).pow(new BN(256)).subn(1);

describe("Market", function () {
  const [ownerAddress, userAddress, poolAddress, userAddress1, userAddress2] = accounts;
  const initialUserDSDBalance = new BN(1000000);

  beforeEach(async function () {
    this.market = await MockMarket.new(poolAddress, {
      from: ownerAddress,
      gas: 8000000,
    });
    this.dollar = await Dollar.at(await this.market.dollar());
    this.cdsd = await ContractionDollar.at(await this.market.cdsd());

    await this.market.incrementEpochE();
    await this.market.stepE();
    await this.market.mintToE(userAddress, initialUserDSDBalance);
    await this.dollar.approve(this.market.address, initialUserDSDBalance, {
      from: userAddress,
    });
  });

  describe("burnDSDForCDSD", function () {
    describe("when burning DSD", function () {
      beforeEach(async function () {
        await this.market.mintToE(userAddress, 1000); // added to initial balance
        await this.dollar.approve(this.market.address, 1000, {
          from: userAddress,
        });

        this.result = await this.market.burnDSDForCDSD(1000, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(initialUserDSDBalance); // after burning only the initial balance remains
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(1000));
        expect(await this.market.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(0)); // user has not deposited

        expect(await this.market.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(1000));
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCDSDShares()).to.be.bignumber.equal(new BN(0));
        expect(await this.market.totalBurnedDSD()).to.be.bignumber.equal(new BN(1000));
      });

      it("emits CDSDMinted event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CDSDMinted", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.amount).to.be.bignumber.equal(new BN(1000));
      });
    });
  });

  describe("burnCouponsForCDSD", function () {
    describe("when burning coupons", function () {
      beforeEach(async function () {
        const couponEpoch = 1;

        await this.market.incrementBalanceOfCouponsE(userAddress, couponEpoch, 1000);
        await this.market.incrementBalanceOfCouponUnderlyingE(userAddress, couponEpoch, 1000);
        this.result = await this.market.burnCouponsForCDSD(couponEpoch, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(2000));
        expect(await this.market.balanceOfCoupons(userAddress, 1)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCouponUnderlying(userAddress, 1)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(0)); // user has not deposited/bonded
        expect(await this.market.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(0)); // not bonded
        expect(await this.market.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(2000));
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCoupons()).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCouponUnderlying()).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCDSDShares()).to.be.bignumber.equal(new BN(0));
        expect(await this.market.totalCDSDBonded()).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalBurnedDSD()).to.be.bignumber.equal(new BN(2000));
      });

      it("emits CDSDMinted event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CDSDMinted", {
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

        this.result = await this.market.burnDSDForCDSDAndBond(1000, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(initialUserDSDBalance); // after burning only the initial balance remains
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(1000)); // user shares of bonded cDSD
        expect(await this.market.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(1000)); // actual bonded cDSD
        expect(await this.market.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(1000));
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(1000));

        expect(await this.market.totalCDSDShares()).to.be.bignumber.equal(new BN(1000));
        expect(await this.market.totalCDSDBonded()).to.be.bignumber.equal(new BN(1000));
        expect(await this.market.totalBurnedDSD()).to.be.bignumber.equal(new BN(1000));
      });

      it("emits CDSDMinted event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CDSDMinted", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.amount).to.be.bignumber.equal(new BN(1000));
      });

      it("emits BondCDSD event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "BondCDSD", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.start).to.be.bignumber.equal(new BN(2));
        expect(event.args.value).to.be.bignumber.equal(new BN(1000));
        expect(event.args.valueUnderlying).to.be.bignumber.equal(new BN(1000));
      });
    });
  });

  describe("burnCouponsForCDSDAndBond", function () {
    describe("when burning coupons plus bonding cDSD", function () {
      beforeEach(async function () {
        const couponEpoch = 1;

        await this.market.incrementBalanceOfCouponsE(userAddress, couponEpoch, 1000);
        await this.market.incrementBalanceOfCouponUnderlyingE(userAddress, couponEpoch, 1000);
        this.result = await this.market.burnCouponsForCDSDAndBond(couponEpoch, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCoupons(userAddress, 1)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCouponUnderlying(userAddress, 1)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(2000)); // user  shares of bonded cDSD
        expect(await this.market.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(2000)); // actual bonded cDSD
        expect(await this.market.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(2000));
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(2000));

        expect(await this.market.totalCoupons()).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCouponUnderlying()).to.be.bignumber.equal(new BN(0));

        expect(await this.market.totalCDSDShares()).to.be.bignumber.equal(new BN(2000));
        expect(await this.market.totalCDSDBonded()).to.be.bignumber.equal(new BN(2000));
        expect(await this.market.totalBurnedDSD()).to.be.bignumber.equal(new BN(2000));
      });

      it("emits CDSDMinted event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CDSDMinted", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.amount).to.be.bignumber.equal(new BN(2000));
      });

      it("emits BondCDSD event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "BondCDSD", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.start).to.be.bignumber.equal(new BN(2));
        expect(event.args.value).to.be.bignumber.equal(new BN(2000));
        expect(event.args.valueUnderlying).to.be.bignumber.equal(new BN(2000));
      });
    });
  });

  describe("bondCDSD", function () {
    describe("when user simply bonds cDSD", function () {
      beforeEach(async function () {
        await this.market.mintCDSDToE(userAddress, 1000, {
          from: userAddress,
        });

        this.result = await this.market.bondCDSD(1000, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(1000)); // user bonded cDSD
        expect(await this.market.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(1000)); // actual bonded cDSD
        expect(await this.market.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(0));
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));

        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(1000));

        expect(await this.market.totalCDSDShares()).to.be.bignumber.equal(new BN(1000));
        expect(await this.market.totalCDSDBonded()).to.be.bignumber.equal(new BN(1000));
        expect(await this.market.totalBurnedDSD()).to.be.bignumber.equal(new BN(0));
      });

      it("emits BondCDSD event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "BondCDSD", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.start).to.be.bignumber.equal(new BN(2));
        expect(event.args.value).to.be.bignumber.equal(new BN(1000));
        expect(event.args.valueUnderlying).to.be.bignumber.equal(new BN(1000));
      });
    });

    describe("when user partially bonds", function () {
      beforeEach(async function () {
        await this.market.mintCDSDToE(userAddress, 1000, {
          from: userAddress,
        });

        this.result = await this.market.bondCDSD(300, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates users balances", async function () {
        expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(700));
        expect(await this.market.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(300)); // user bonded cDSD
        expect(await this.market.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(300)); // actual bonded cDSD
        expect(await this.market.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(0));
      });

      it("updates dao balances", async function () {
        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(300));

        expect(await this.market.totalCDSDShares()).to.be.bignumber.equal(new BN(300));
        expect(await this.market.totalCDSDBonded()).to.be.bignumber.equal(new BN(300));
        expect(await this.market.totalBurnedDSD()).to.be.bignumber.equal(new BN(0));
      });

      it("emits BondCDSD event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "BondCDSD", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.start).to.be.bignumber.equal(new BN(2));
        expect(event.args.value).to.be.bignumber.equal(new BN(300));
        expect(event.args.valueUnderlying).to.be.bignumber.equal(new BN(300));
      });
    });

    describe("multiple users bond their cDSD", function () {
      beforeEach(async function () {
        await this.market.mintCDSDToE(userAddress1, 1000);
        await this.market.mintCDSDToE(userAddress2, 1000);

        await this.market.bondCDSD(600, { from: userAddress1 });

        await this.market.bondCDSD(400, { from: userAddress2 });

        await this.market.incrementEpochE({ from: userAddress });

        await this.market.mintCDSDToE(this.market.address, 1000);

        await this.market.mintCDSDToE(userAddress, 1000);
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

        expect(await this.market.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(250)); // user shares of bonded cDSD
        expect(await this.market.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(500)); // actual bonded cDSD
        expect(await this.market.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(0)); // user has not burned any DSD; may have just bought cDSD off the market
      });

      it("updates dao balances", async function () {
        expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(
          new BN(600).add(new BN(400)).add(new BN(1000)).add(new BN(500)),
        );

        expect(await this.market.totalCDSDShares()).to.be.bignumber.equal(new BN(1250));
        expect(await this.market.totalCDSDBonded()).to.be.bignumber.equal(new BN(2500));
        expect(await this.market.totalBurnedDSD()).to.be.bignumber.equal(new BN(0));
      });

      it("emits BondCDSD event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "BondCDSD", {
          account: userAddress,
        });

        expect(event.args.account).to.be.bignumber.equal(userAddress);
        expect(event.args.start).to.be.bignumber.equal(new BN(3));
        expect(event.args.value).to.be.bignumber.equal(new BN(250));
        expect(event.args.valueUnderlying).to.be.bignumber.equal(new BN(500));
      });
    });
  });

  describe("unbondCDSD", function () {
    describe("calls that reverts", function () {
      beforeEach(async function () {
        await this.market.mintCDSDToE(userAddress, 1000, {
          from: userAddress,
        });

        await this.market.bondCDSD(1000, {
          from: userAddress,
        });

        await this.market.incrementEpochE({ from: userAddress });
      });

      it("cannot unbound more shares than owned", async function () {
        await expectRevert(
          this.market.unbondCDSD(new BN(1500), { from: userAddress }),
          "Market: insufficient shares to unbound",
        );
      });

      it("cannot have no amount", async function () {
        await expectRevert(
          this.market.unbondCDSD(new BN(0), { from: userAddress }),
          "Market: unbound must be greater than 0",
        );
      });
    });

    describe("when unbonding cdsd", function () {
      beforeEach(async function () {
        await this.market.mintCDSDToE(userAddress, 1000, {
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
          expect(await this.market.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(0));
          expect(await this.market.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(0));
          expect(await this.market.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(0));
        });

        it("updates dao balances", async function () {
          expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));
          expect(await this.market.totalCDSDShares()).to.be.bignumber.equal(new BN(0));
          expect(await this.market.totalCDSDBonded()).to.be.bignumber.equal(new BN(0));
          expect(await this.market.totalBurnedDSD()).to.be.bignumber.equal(new BN(0));
        });

        it("emits UnbondCDSD event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockMarket, "UnbondCDSD", {
            account: userAddress,
          });

          expect(event.args.account).to.be.bignumber.equal(userAddress);
          expect(event.args.start).to.be.bignumber.equal(new BN(3));
          expect(event.args.value).to.be.bignumber.equal(new BN(1000));
          expect(event.args.valueUnderlying).to.be.bignumber.equal(new BN(1000));
        });
      });

      describe("partially unbounding", function () {
        beforeEach(async function () {
          this.result = await this.market.unbondCDSD(new BN(800), { from: userAddress });
          this.txHash = this.result.tx;
        });

        it("updates users balances", async function () {
          expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(new BN(800));
          expect(await this.market.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(200));
          expect(await this.market.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(200));
          expect(await this.market.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(0));
        });

        it("updates dao balances", async function () {
          expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(200));
          expect(await this.market.totalCDSDShares()).to.be.bignumber.equal(new BN(200));
          expect(await this.market.totalCDSDBonded()).to.be.bignumber.equal(new BN(200));
          expect(await this.market.totalBurnedDSD()).to.be.bignumber.equal(new BN(0));
        });

        it("emits UnbondCDSD event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockMarket, "UnbondCDSD", {
            account: userAddress,
          });

          expect(event.args.account).to.be.bignumber.equal(userAddress);
          expect(event.args.start).to.be.bignumber.equal(new BN(3));
          expect(event.args.value).to.be.bignumber.equal(new BN(800));
          expect(event.args.valueUnderlying).to.be.bignumber.equal(new BN(800));
        });
      });

      describe("multiple", function () {
        beforeEach(async function () {
          await this.market.mintCDSDToE(userAddress1, 1000);
          await this.market.mintCDSDToE(userAddress2, 1000);

          await this.market.bondCDSD(600, { from: userAddress1 });
          await this.market.bondCDSD(400, { from: userAddress2 });

          await this.market.incrementEpochE({ from: userAddress });

          await this.market.mintCDSDToE(this.market.address, 1000);

          this.result = await this.market.unbondCDSD(800, {
            from: userAddress,
          });

          this.txHash = this.result.tx;
        });

        it("updates users balances", async function () {
          const userBalanceAfterUnbonding = new BN(800)
            .mul(await this.cdsd.balanceOf(this.market.address))
            .div(await this.market.totalCDSDShares());
          expect(await this.cdsd.balanceOf(userAddress)).to.be.bignumber.equal(userBalanceAfterUnbonding);
          expect(await this.market.balanceOfCDSDShares(userAddress)).to.be.bignumber.equal(new BN(200)); // user shares of bonded cDSD
          expect(await this.market.balanceOfCDSDBonded(userAddress)).to.be.bignumber.equal(new BN(300)); // actual bonded in total by cDSD
          expect(await this.market.balanceOfBurnedCDSD(userAddress)).to.be.bignumber.equal(new BN(0));
        });

        it("updates dao balances", async function () {
          expect(await this.cdsd.balanceOf(this.market.address)).to.be.bignumber.equal(
            new BN(600).add(new BN(400)).add(new BN(1000)).add(new BN(1000)).sub(new BN(1200)), // 800 shares was removed which equals 1200 cDSD so 3000 - 1200 = 1800
          );
          expect(await this.market.totalCDSDShares()).to.be.bignumber.equal(new BN(1200));
          expect(await this.market.totalCDSDBonded()).to.be.bignumber.equal(new BN(1800)); // should be same as cdsd.balanceOf(address(this))
          expect(await this.market.totalBurnedDSD()).to.be.bignumber.equal(new BN(0));
        });

        it("emits UnbondCDSD event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockMarket, "UnbondCDSD", {
            account: userAddress,
          });

          expect(event.args.account).to.be.bignumber.equal(userAddress);
          expect(event.args.start).to.be.bignumber.equal(new BN(4));
          expect(event.args.value).to.be.bignumber.equal(new BN(800));
          expect(event.args.valueUnderlying).to.be.bignumber.equal(new BN(1200));
        });
      });
    });
  });

  // legacy: coupons are not purchasable anymore
  describe.skip("purchaseCoupons - legacy", function () {
    describe("before call", function () {
      beforeEach(async function () {
        await this.market.incrementTotalDebtE(100000);
      });

      it("shows correct potential coupon premium", async function () {
        expect(await this.market.couponPremium(100000)).to.be.bignumber.equal(new BN(3703));
      });
    });

    describe("no amount", function () {
      it("reverts", async function () {
        await expectRevert(
          this.market.purchaseCoupons(0, { from: userAddress }),
          "Market: Must purchase non-zero amount",
        );
      });
    });

    describe("no debt", function () {
      it("total net is correct", async function () {
        expect(await this.market.totalNet()).to.be.bignumber.equal(new BN(1000000));
      });

      it("reverts", async function () {
        await expectRevert(this.market.purchaseCoupons(100000), "Market: Not enough debt");
      });
    });

    describe("on single call", function () {
      beforeEach(async function () {
        await this.market.incrementTotalDebtE(100000);
        this.result = await this.market.purchaseCoupons(100000, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates user balances", async function () {
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(900000));
        expect(await this.market.balanceOfCoupons(userAddress, 1)).to.be.bignumber.equal(new BN(103703 / 2)); // coupons have been divided by 2: half can expire, the other can be reclaimed
      });

      it("shows correct premium", async function () {
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(900000));
        expect(await this.market.balanceOfCoupons(userAddress, 1)).to.be.bignumber.equal(new BN(103703 / 2)); // coupons have been divided by 2: half can expire the other can be reclaimed
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.totalCoupons()).to.be.bignumber.equal(
          new BN(103703 / 2), // coupons have been divided by 2: half can expire the other can be reclaimed
        );
        expect(await this.market.totalDebt()).to.be.bignumber.equal(new BN(0));
        expect(await this.market.totalRedeemable()).to.be.bignumber.equal(new BN(0));
      });

      it("emits CouponPurchase event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponPurchase", {
          account: userAddress,
        });

        expect(event.args.epoch).to.be.bignumber.equal(new BN(1));
        expect(event.args.dollarAmount).to.be.bignumber.equal(new BN(100000));
        expect(event.args.couponAmount).to.be.bignumber.equal(
          new BN(103703 / 2), // coupons have been divided by 2: half can expire the other can be reclaimed
        );
      });
    });

    describe("multiple calls", function () {
      beforeEach(async function () {
        await this.market.incrementTotalDebtE(100000);
        await this.market.purchaseCoupons(50000, { from: userAddress });
        this.result = await this.market.purchaseCoupons(50000, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates user balances", async function () {
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(900000));
        expect(await this.market.balanceOfCoupons(userAddress, 1)).to.be.bignumber.equal(new BN(103805 / 2)); // coupons have been divided by 2: half can expire the other can be reclaimed
      });

      it("updates dao balances", async function () {
        expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.totalCoupons()).to.be.bignumber.equal(
          new BN(103805 / 2), // coupons have been divided by 2: half can expire the other can be reclaimed
        );
        expect(await this.market.totalDebt()).to.be.bignumber.equal(new BN(0));
        expect(await this.market.totalRedeemable()).to.be.bignumber.equal(new BN(0));
      });

      it("emits CouponPurchase event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponPurchase", {
          account: userAddress,
        });

        expect(event.args.epoch).to.be.bignumber.equal(new BN(1));
        expect(event.args.dollarAmount).to.be.bignumber.equal(new BN(50000));
        expect(event.args.couponAmount).to.be.bignumber.equal(
          new BN(50925 / 2), // coupons have been divided by 2: half can expire the other can be reclaimed
        );
      });
    });
  });

  // legacy: coupons are not redeemable anymore
  describe.skip("redeemCoupons - legacy", function () {
    const minOutput = 0;
    beforeEach(async function () {
      await this.market.incrementTotalDebtE(100000);
      await this.market.purchaseCoupons(100000, { from: userAddress });
      await this.market.mintToE(this.market.address, 100000);
      await this.market.incrementTotalRedeemableE(100000);
    });

    describe("before redeemable", function () {
      describe("same epoch", function () {
        it("reverts", async function () {
          await expectRevert(
            this.market.redeemCoupons(1, 100000, minOutput, {
              from: userAddress,
            }),
            "Market: Too early to redeem",
          );
        });
      });

      describe("next epoch", function () {
        it("reverts", async function () {
          await this.market.incrementEpochE();
          await expectRevert(
            this.market.redeemCoupons(1, 100000, minOutput, {
              from: userAddress,
            }),
            "Market: Too early to redeem",
          );
        });
      });
    });

    describe("after redeemable", function () {
      beforeEach(async function () {
        await this.market.incrementEpochE();
        await this.market.incrementEpochE();
      });

      describe("not enough coupon balance", function () {
        it("reverts", async function () {
          await expectRevert(
            this.market.redeemCoupons(1, 200000, minOutput, {
              from: userAddress,
            }),
            "Market: Insufficient coupon balance",
          );
        });
      });

      describe("on single call", function () {
        beforeEach(async function () {
          await time.increase(3600); // advances 1 hour to avoid coupon redemption penalty
          this.result = await this.market.redeemCoupons(1, 100000, minOutput, {
            from: userAddress,
          });
          this.txHash = this.result.tx;
        });

        it("updates user balances", async function () {
          expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(1000000));
          expect(await this.market.balanceOfCoupons(userAddress, 1)).to.be.bignumber.equal(new BN(3703));
        });

        it("updates dao balances", async function () {
          expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(0));
          expect(await this.market.totalCoupons()).to.be.bignumber.equal(new BN(3703));
          expect(await this.market.totalDebt()).to.be.bignumber.equal(new BN(0));
          expect(await this.market.totalRedeemable()).to.be.bignumber.equal(new BN(0));
        });

        it("emits CouponRedemption event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponRedemption", {
            account: userAddress,
          });

          expect(event.args.epoch).to.be.bignumber.equal(new BN(1));
          expect(event.args.couponAmount).to.be.bignumber.equal(new BN(100000));
        });
      });

      describe("multiple calls", function () {
        beforeEach(async function () {
          this.result = await this.market.redeemCoupons(1, 30000, minOutput, {
            from: userAddress,
          });
          this.result = await this.market.redeemCoupons(1, 50000, minOutput, {
            from: userAddress,
          });
          this.txHash = this.result.tx;
        });

        it("updates user balances", async function () {
          expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(980000));
          expect(await this.market.balanceOfCoupons(userAddress, 1)).to.be.bignumber.equal(new BN(23703));
        });

        it("updates dao balances", async function () {
          expect(await this.dollar.balanceOf(this.market.address)).to.be.bignumber.equal(new BN(20000));
          expect(await this.market.totalCoupons()).to.be.bignumber.equal(new BN(23703));
          expect(await this.market.totalDebt()).to.be.bignumber.equal(new BN(0));
          expect(await this.market.totalRedeemable()).to.be.bignumber.equal(new BN(20000));
        });

        it("emits CouponRedemption event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponRedemption", {
            account: userAddress,
          });

          expect(event.args.epoch).to.be.bignumber.equal(new BN(1));
          expect(event.args.couponAmount).to.be.bignumber.equal(new BN(50000));
        });
      });
    });

    describe("after expired", function () {
      this.timeout(30000000);

      beforeEach(async function () {
        const couponExpiration = 360;
        for (let i = 0; i < couponExpiration; i++) {
          await this.market.incrementEpochE();
        }
        await this.market.stepE();
      });

      it("reverts", async function () {
        await expectRevert(
          this.market.redeemCoupons(1, 100000, minOutput, { from: userAddress }),
          "Market: Insufficient coupon balance",
        );
      });
    });
  });

  describe("approveCoupons", function () {
    describe("zero address", function () {
      it("reverts", async function () {
        await expectRevert(
          this.market.approveCoupons(ZERO_ADDRESS, 1000, {
            from: userAddress,
          }),
          "Market: Coupon approve to the zero address",
        );
      });
    });

    describe("on single call", function () {
      beforeEach(async function () {
        this.result = await this.market.approveCoupons(ownerAddress, 100000, { from: userAddress });
        this.txHash = this.result.tx;
      });

      it("updates user approval", async function () {
        expect(await this.market.allowanceCoupons(userAddress, ownerAddress)).to.be.bignumber.equal(new BN(100000));
      });

      it("emits CouponApproval event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponApproval", {
          owner: userAddress,
          spender: ownerAddress,
        });

        expect(event.args.value).to.be.bignumber.equal(new BN(100000));
      });
    });

    describe("multiple calls", function () {
      beforeEach(async function () {
        await this.market.approveCoupons(ownerAddress, 100000, {
          from: userAddress,
        });
        this.result = await this.market.approveCoupons(ownerAddress, 0, { from: userAddress });
        this.txHash = this.result.tx;
      });

      it("updates user approval", async function () {
        expect(await this.market.allowanceCoupons(userAddress, ownerAddress)).to.be.bignumber.equal(new BN(0));
      });

      it("emits CouponApproval event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponApproval", {
          owner: userAddress,
          spender: ownerAddress,
        });

        expect(event.args.value).to.be.bignumber.equal(new BN(0));
      });
    });
  });

  describe("transferCoupons", function () {
    beforeEach(async function () {
      await this.market.incrementBalanceOfCouponsE(userAddress,1 , 100000);
    });

    describe("sender zero address", function () {
      it("reverts", async function () {
        await expectRevert(
          this.market.transferCoupons(ZERO_ADDRESS, userAddress, 1, 100000, { from: userAddress }),
          "Market: Coupon transfer from the zero address",
        );
      });
    });

    describe("recipient zero address", function () {
      it("reverts", async function () {
        await expectRevert(
          this.market.transferCoupons(userAddress, ZERO_ADDRESS, 1, 100000, { from: userAddress }),
          "Market: Coupon transfer to the zero address",
        );
      });
    });

    describe("on call from self", function () {
      beforeEach(async function () {
        this.result = await this.market.transferCoupons(userAddress, ownerAddress, 1, 100000, {
          from: userAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates balances", async function () {
        expect(await this.market.balanceOfCoupons(userAddress, 1)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCoupons(ownerAddress, 1)).to.be.bignumber.equal(new BN(100000));
      });

      it("emits CouponTransfer event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponTransfer", {
          from: userAddress,
          to: ownerAddress,
        });

        expect(event.args.epoch).to.be.bignumber.equal(new BN(1));
        expect(event.args.value).to.be.bignumber.equal(new BN(100000));
      });
    });

    describe("on call from self too much", function () {
      it("reverts", async function () {
        await expectRevert(
          this.market.transferCoupons(userAddress, ownerAddress, 1, 200000, { from: ownerAddress }),
          "Market: Insufficient coupon balance",
        );
      });
    });

    describe("on unapproved call from other", function () {
      it("reverts", async function () {
        await expectRevert(
          this.market.transferCoupons(userAddress, ownerAddress, 1, 100000, { from: ownerAddress }),
          "Market: Insufficient coupon approval",
        );
      });
    });

    describe("on approved call from other", function () {
      beforeEach(async function () {
        await this.market.approveCoupons(ownerAddress, 100000, {
          from: userAddress,
        });
        this.result = await this.market.transferCoupons(userAddress, ownerAddress, 1, 100000, {
          from: ownerAddress,
        });
        this.txHash = this.result.tx;
      });

      it("updates balances", async function () {
        expect(await this.market.balanceOfCoupons(userAddress, 1)).to.be.bignumber.equal(new BN(0));
        expect(await this.market.balanceOfCoupons(ownerAddress, 1)).to.be.bignumber.equal(new BN(100000));
      });

      it("updates approval", async function () {
        expect(await this.market.allowanceCoupons(userAddress, ownerAddress)).to.be.bignumber.equal(new BN(0));
      });

      it("emits CouponTransfer event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponTransfer", {
          from: userAddress,
          to: ownerAddress,
        });

        expect(event.args.epoch).to.be.bignumber.equal(new BN(1));
        expect(event.args.value).to.be.bignumber.equal(new BN(100000));
      });
    });

    describe("infinite approval", function () {
      beforeEach(async function () {
        await this.market.approveCoupons(ownerAddress, MAX_UINT256, {
          from: userAddress,
        });
        await this.market.transferCoupons(userAddress, ownerAddress, 1, 100000, { from: ownerAddress });
      });

      it("doesnt update approval", async function () {
        expect(await this.market.allowanceCoupons(userAddress, ownerAddress)).to.be.bignumber.equal(MAX_UINT256);
      });
    });
  });

  describe("step", function () {
    beforeEach(async function () {
      await this.market.incrementEpochE();
      await this.market.stepE();
    });

    describe("on call without expiration", function () {
      it("initializes coupon expiry", async function () {
        const COUPON_EXPIRATION = 360;
        expect(await this.market.couponsExpiration(2)).to.be.bignumber.equal(new BN(COUPON_EXPIRATION + 2));
        expect(await this.market.expiringCoupons(COUPON_EXPIRATION + 2)).to.be.bignumber.equal(new BN(1));
        expect(await this.market.expiringCouponsAtIndex(COUPON_EXPIRATION + 2, 0)).to.be.bignumber.equal(new BN(2));
      });
    });

    describe("on call with expiration", function () {
      this.timeout(3000000);

      beforeEach(async function () {
        const currentEpoch = await this.market.epoch()
        await this.market.incrementBalanceOfCouponsE(userAddress, currentEpoch, 100000);

        await this.market.incrementEpochE();
        await this.market.stepE();
        const COUPON_EXPIRATION = 360;
        for (let i = 0; i < COUPON_EXPIRATION - 1; i++) {
          await this.market.incrementEpochE();
        }
        this.result = await this.market.stepE();
        this.txHash = this.result.tx;
      });

      it("emits CouponExpiration event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponExpiration", {});

        expect(event.args.epoch).to.be.bignumber.equal(new BN(2));
        expect(event.args.couponsExpired).to.be.bignumber.equal(
          new BN(100000),
        );
        expect(event.args.lessDebt).to.be.bignumber.equal(new BN(0));
        expect(event.args.newBonded).to.be.bignumber.equal(new BN(0));
      });
    });

    describe("on call with all reclaimed no bonded", function () {
      this.timeout(3000000);

      beforeEach(async function () {
        const currentEpoch = await this.market.epoch()
        await this.market.incrementBalanceOfCouponsE(userAddress, currentEpoch, 100000);

        await this.market.mintToE(this.market.address, 100000);
        await this.market.incrementTotalRedeemableE(100000);

        await this.market.incrementEpochE();
        this.result = await this.market.stepE();
        const COUPON_EXPIRATION = 360;
        for (let i = 0; i < COUPON_EXPIRATION - 1; i++) {
          await this.market.incrementEpochE();
        }
        this.result = await this.market.stepE();
        this.txHash = this.result.tx;
      });

      it("emits CouponExpiration event", async function () {
        const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponExpiration", {});

        expect(event.args.epoch).to.be.bignumber.equal(new BN(2));
        expect(event.args.couponsExpired).to.be.bignumber.equal(
          new BN(100000),
        );
        expect(event.args.lessRedeemable).to.be.bignumber.equal(new BN(100000));
        expect(event.args.lessDebt).to.be.bignumber.equal(new BN(0));
        expect(event.args.newBonded).to.be.bignumber.equal(new BN(43000));
      });
    });

    describe("with bonded", function () {
      beforeEach(async function () {
        await this.market.mintToE(this.market.address, 100000);
        await this.market.incrementTotalBondedE(100000);
      });

      describe("on call with all reclaimed", function () {
        this.timeout(30000000);

        beforeEach(async function () {
          const currentEpoch = await this.market.epoch()
          await this.market.incrementBalanceOfCouponsE(userAddress, currentEpoch, 100000);

          await this.market.mintToE(this.market.address, 100000);
          await this.market.incrementTotalRedeemableE(100000);

          await this.market.incrementEpochE();
          this.result = await this.market.stepE();

          const COUPON_EXPIRATION = 360;
          for (let i = 0; i < COUPON_EXPIRATION - 1; i++) {
            await this.market.incrementEpochE();
          }
          this.result = await this.market.stepE();
          this.txHash = this.result.tx;
        });

        it("emits CouponExpiration event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponExpiration", {});

          expect(event.args.epoch).to.be.bignumber.equal(new BN(2));
          expect(event.args.couponsExpired).to.be.bignumber.equal(
            new BN(100000),
          );
          expect(event.args.lessRedeemable).to.be.bignumber.equal(new BN(100000));
          expect(event.args.lessDebt).to.be.bignumber.equal(new BN(0));
          expect(event.args.newBonded).to.be.bignumber.equal(new BN(100000));
        });
      });

      describe("on call with some reclaimed", function () {
        this.timeout(30000000);

        beforeEach(async function () {
          const currentEpoch = await this.market.epoch()
          await this.market.incrementBalanceOfCouponsE(userAddress, currentEpoch, 50000);
          const newCurrentEpoch = await this.market.epoch()
          await this.market.incrementEpochE();
          await this.market.incrementBalanceOfCouponsE(userAddress, newCurrentEpoch, 50000);

          await this.market.mintToE(this.market.address, 100000);
          await this.market.incrementTotalRedeemableE(100000);

          this.result = await this.market.stepE();

          const COUPON_EXPIRATION = 360;
          for (let i = 0; i < COUPON_EXPIRATION - 1; i++) {
            await this.market.incrementEpochE();
          }
          this.result = await this.market.stepE();
          this.txHash = this.result.tx;
        });

        it("emits CouponExpiration event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponExpiration", {});

          expect(event.args.epoch).to.be.bignumber.equal(new BN(2));
          expect(event.args.couponsExpired).to.be.bignumber.equal(
            new BN(100000),
          );
          expect(event.args.lessDebt).to.be.bignumber.equal(new BN(0));
          expect(event.args.newBonded).to.be.bignumber.equal(new BN(100000));
        });
      });

      describe("reclaimed some debt", function () {
        this.timeout(3000000);

        beforeEach(async function () {
          const currentEpoch = await this.market.epoch()
          await this.market.incrementBalanceOfCouponsE(userAddress, currentEpoch, 50000);


          const newCurrentEpoch = await this.market.epoch()
          await this.market.incrementEpochE();
          await this.market.incrementBalanceOfCouponsE(userAddress, newCurrentEpoch, 50000);

          await this.market.mintToE(this.market.address, 100000);
          await this.market.incrementTotalRedeemableE(100000);

          this.result = await this.market.stepE();

          const COUPON_EXPIRATION = 360;
          for (let i = 0; i < COUPON_EXPIRATION - 1; i++) {
            await this.market.incrementEpochE();
          }
          this.result = await this.market.stepE();
          this.txHash = this.result.tx;
        });

        it("emits CouponExpiration event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponExpiration", {});

          expect(event.args.epoch).to.be.bignumber.equal(new BN(2));
          expect(event.args.couponsExpired).to.be.bignumber.equal(
            new BN(100000),
          );
          expect(event.args.lessDebt).to.be.bignumber.equal(new BN(0));
          expect(event.args.newBonded).to.be.bignumber.equal(new BN(100000));
        });
      });

      describe("reclaimed all debt and some bonded", function () {
        this.timeout(30000000);

        beforeEach(async function () {
          const currentEpoch = await this.market.epoch()
          await this.market.incrementBalanceOfCouponsE(userAddress, currentEpoch, 50000);

          await this.market.incrementEpochE();
          const newCurrentEpoch = await this.market.epoch()
          await this.market.incrementBalanceOfCouponsE(userAddress, newCurrentEpoch, 50000);

          await this.market.mintToE(this.market.address, 100000);
          await this.market.incrementTotalRedeemableE(100000);

          this.result = await this.market.stepE();

          const COUPON_EXPIRATION = 360;
          for (let i = 0; i < COUPON_EXPIRATION - 1; i++) {
            await this.market.incrementEpochE();
          }
          this.result = await this.market.stepE();
          this.txHash = this.result.tx;
        });

        it("emits CouponExpiration event", async function () {
          const event = await expectEvent.inTransaction(this.txHash, MockMarket, "CouponExpiration", {});

          expect(event.args.epoch).to.be.bignumber.equal(new BN(2));
          expect(event.args.couponsExpired).to.be.bignumber.equal(
            new BN(50000),
          );
          expect(event.args.lessDebt).to.be.bignumber.equal(new BN(0));
          expect(event.args.newBonded).to.be.bignumber.equal(new BN(50000));
        });
      });
    });
  });
});

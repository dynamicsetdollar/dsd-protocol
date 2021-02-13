const { accounts, contract } = require("@openzeppelin/test-environment");

const { BN, expectRevert, time } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");

const MockComptroller = contract.fromArtifact("MockComptroller");
const MockComptrollerAndMarket = contract.fromArtifact("MockMarket");
const Dollar = contract.fromArtifact("Dollar");

const BOOTSTRAPPING_PERIOD = 150; // DSD bootstraping

describe("Comptroller", function () {
  const [ownerAddress, userAddress, poolAddress, circulating] = accounts;

  beforeEach(async function () {
    this.comptroller = await MockComptroller.new(poolAddress, {
      from: ownerAddress,
      gas: 8000000,
    });
    this.dollar = await Dollar.at(await this.comptroller.dollar());
  });

  describe("mintToAccount", function () {
    beforeEach(async function () {
      await this.comptroller.mintToAccountE(circulating, new BN(10000));
    });

    describe("bootstrapping", function () {
      describe("on single call", function () {
        beforeEach(async function () {
          await this.comptroller.mintToAccountE(userAddress, new BN(100));
        });

        it("mints new Dollar tokens", async function () {
          expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(10100));
          expect(await this.dollar.balanceOf(this.comptroller.address)).to.be.bignumber.equal(new BN(0));
          expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(100));
        });

        it("doesnt update total debt", async function () {
          expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(0));
        });
      });

      describe("multiple calls", function () {
        beforeEach(async function () {
          await this.comptroller.mintToAccountE(userAddress, new BN(100));
          await this.comptroller.mintToAccountE(userAddress, new BN(200));
        });

        it("mints new Dollar tokens", async function () {
          expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(10300));
          expect(await this.dollar.balanceOf(this.comptroller.address)).to.be.bignumber.equal(new BN(0));
          expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(300));
        });

        it("doesnt update total debt", async function () {
          expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(0));
        });
      });
    });

    describe("bootstrapped", function () {
      this.timeout(30000);

      beforeEach(async function () {
        for (let i = 0; i < BOOTSTRAPPING_PERIOD + 1; i++) {
          await this.comptroller.incrementEpochE();
        }
      });

      describe("on single call", function () {
        beforeEach(async function () {
          await this.comptroller.mintToAccountE(userAddress, new BN(100));
        });

        it("mints new Dollar tokens", async function () {
          expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(10100));
          expect(await this.dollar.balanceOf(this.comptroller.address)).to.be.bignumber.equal(new BN(0));
          expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(100));
        });

        it.skip("updates total debt - legacy", async function () {
          expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(100));
        });
      });

      describe("multiple calls", function () {
        beforeEach(async function () {
          await this.comptroller.mintToAccountE(userAddress, new BN(100));
          await this.comptroller.mintToAccountE(userAddress, new BN(200));
        });

        it("mints new Dollar tokens", async function () {
          expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(10300));
          expect(await this.dollar.balanceOf(this.comptroller.address)).to.be.bignumber.equal(new BN(0));
          expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(300));
        });

        it.skip("updates total debt - legacy", async function () {
          expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(300));
        });
      });
    });
  });

  describe("burnFromAccount", function () {
    beforeEach(async function () {
      await this.comptroller.mintToAccountE(circulating, new BN(10000));
      // const debt = await this.comptroller.totalDebt()
      // await this.comptroller.decreaseDebtE(debt)

      await this.comptroller.mintToE(userAddress, new BN(1000));
      // await this.comptroller.increaseDebtE(new BN(1000))
      await this.dollar.approve(this.comptroller.address, new BN(1000), {
        from: userAddress,
      });
    });

    describe("on single call", function () {
      beforeEach(async function () {
        await this.comptroller.burnFromAccountE(userAddress, new BN(100));
      });

      it("destroys Dollar tokens", async function () {
        expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(10900));
        expect(await this.dollar.balanceOf(this.comptroller.address)).to.be.bignumber.equal(new BN(0));
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(900));
      });

      it.skip("updates total debt - legacy", async function () {
        expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(900));
      });
    });

    describe("multiple calls", function () {
      beforeEach(async function () {
        await this.comptroller.burnFromAccountE(userAddress, new BN(100));
        await this.comptroller.burnFromAccountE(userAddress, new BN(200));
      });

      it("destroys Dollar tokens", async function () {
        expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(10700));
        expect(await this.dollar.balanceOf(this.comptroller.address)).to.be.bignumber.equal(new BN(0));
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(700));
      });

      it.skip("updates total debt - legacy", async function () {
        expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(700));
      });
    });

    describe.skip("call when not enough debt - legacy", function () {
      beforeEach(async function () {
        await this.comptroller.decreaseDebtE(new BN(900));
      });

      it("reverts", async function () {
        await expectRevert(this.comptroller.burnFromAccountE(userAddress, new BN(200)), "not enough outstanding debt");
      });
    });
  });

  describe("increaseSupply", function () {
    beforeEach(async function () {
      this.comptrollerWithMarket = await MockComptrollerAndMarket.new(poolAddress, {
        from: ownerAddress,
        gas: 8000000,
      });
      this.dollarFromComptrollerWithMarket = await Dollar.at(await this.comptrollerWithMarket.dollar());
    });

    describe("no one is bonded", function () {
      beforeEach(async function () {
        await this.comptrollerWithMarket.increaseSupplyE(new BN(1000));
        this.poolReward = new BN(400); // 40%
        this.treasuryReward = new BN(30); // 3%

        this.treasury = await this.comptrollerWithMarket.treasuryE();
      });

      it("shares only rewards to pool and treasury", async function () {
        expect(await this.dollarFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(
          this.poolReward.add(this.treasuryReward),
        );
        expect(await this.dollarFromComptrollerWithMarket.balanceOf(poolAddress)).to.be.bignumber.equal(
          this.poolReward,
        );
        expect(await this.dollarFromComptrollerWithMarket.balanceOf(this.treasury)).to.be.bignumber.equal(
          this.treasuryReward,
        );
        expect(
          await this.dollarFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(0));
      });

      it("has no redeemable cDSD", async function () {
        expect(await this.comptroller.dip10TotalRedeemable()).to.be.bignumber.equal(new BN(0));
      });
    });

    describe("bonded DSD but no bonded cDSD", function () {
      beforeEach(async function () {
        await this.comptrollerWithMarket.mintToE(this.comptrollerWithMarket.address, new BN(9000));
        await this.comptrollerWithMarket.incrementTotalBondedE(new BN(1000));

        await this.comptrollerWithMarket.increaseSupplyE(new BN(1000));
        this.poolReward = new BN(400); // 40%
        this.treasuryReward = new BN(30); // 3%
        this.treasury = await this.comptrollerWithMarket.treasuryE();
        this.daoReward = new BN(1000).sub(this.poolReward).sub(this.treasuryReward);
      });

      it("shares rewards", async function () {
        expect(await this.dollarFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(new BN(10000));
        expect(await this.dollarFromComptrollerWithMarket.balanceOf(poolAddress)).to.be.bignumber.equal(
          this.poolReward,
        );
        expect(await this.dollarFromComptrollerWithMarket.balanceOf(this.treasury)).to.be.bignumber.equal(
          this.treasuryReward,
        );
        expect(
          await this.dollarFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(9000).add(this.daoReward));
      });

      it("has no redeemable DSD", async function () {
        expect(await this.comptrollerWithMarket.dip10TotalRedeemable()).to.be.bignumber.equal(new BN(0));
      });
    });

    describe("bonded DSD and burned DSD", function () {
      beforeEach(async function () {
        await this.comptrollerWithMarket.mintToE(userAddress, new BN(1000));
        await this.dollarFromComptrollerWithMarket.approve(this.comptrollerWithMarket.address, new BN(1000), {
          from: userAddress,
        });
        await this.comptrollerWithMarket.burnDSDForCDSD(new BN(1000), { from: userAddress });

        await this.comptrollerWithMarket.mintToE(this.comptrollerWithMarket.address, new BN(9000));
        await this.comptrollerWithMarket.incrementTotalBondedE(new BN(1000));

        await this.comptrollerWithMarket.increaseSupplyE(new BN(1000));
        this.poolReward = new BN(400); // 40%
        this.treasuryReward = new BN(30); // 3%
        this.treasury = await this.comptrollerWithMarket.treasuryE();
        this.daoReward = new BN(1000).sub(this.poolReward).sub(this.treasuryReward);
      });

      it("shares rewards", async function () {
        expect(await this.dollarFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(new BN(10000));
        expect(await this.dollarFromComptrollerWithMarket.balanceOf(poolAddress)).to.be.bignumber.equal(
          this.poolReward,
        );
        expect(await this.dollarFromComptrollerWithMarket.balanceOf(this.treasury)).to.be.bignumber.equal(
          this.treasuryReward,
        );
        expect(
          await this.dollarFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(9000).add(this.daoReward));
      });

      it("has redeemable DSD", async function () {
        expect(await this.comptrollerWithMarket.dip10TotalRedeemable()).to.be.bignumber.equal(new BN(500));
      });
    });

    describe("bonded DSD and bonded cDSD", function () {
      beforeEach(async function () {
        await this.comptrollerWithMarket.mintToE(userAddress, new BN(1000));
        await this.dollarFromComptrollerWithMarket.approve(this.comptrollerWithMarket.address, new BN(1000), {
          from: userAddress,
        });
        await this.comptrollerWithMarket.burnDSDForCDSDAndBond(new BN(1000), { from: userAddress });

        await this.comptrollerWithMarket.mintToE(this.comptrollerWithMarket.address, new BN(9000));
        await this.comptrollerWithMarket.incrementTotalBondedE(new BN(1000));

        await this.comptrollerWithMarket.increaseSupplyE(new BN(1000));
        this.poolReward = new BN(400); // 40%
        this.treasuryReward = new BN(30); // 3%
        this.treasury = await this.comptrollerWithMarket.treasuryE();
        this.daoReward = new BN(1000).sub(this.poolReward).sub(this.treasuryReward);
      });

      it("shares rewards", async function () {
        expect(await this.dollarFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(new BN(10000));
        expect(await this.dollarFromComptrollerWithMarket.balanceOf(poolAddress)).to.be.bignumber.equal(
          this.poolReward,
        );
        expect(await this.dollarFromComptrollerWithMarket.balanceOf(this.treasury)).to.be.bignumber.equal(
          this.treasuryReward,
        );
        expect(
          await this.dollarFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(9000).add(this.daoReward));
      });

      it("has redeemable DSD", async function () {
        expect(await this.comptrollerWithMarket.dip10TotalRedeemable()).to.be.bignumber.equal(new BN(500));
      });
    });
  });

  describe("increaseCDSDSupply", function () {
    beforeEach(async function () {
      this.comptrollerWithMarket = await MockComptrollerAndMarket.new(poolAddress, {
        from: ownerAddress,
        gas: 8000000,
      });
      this.dollarFromComptrollerWithMarket = await Dollar.at(await this.comptrollerWithMarket.dollar());
      this.cdsdFromComptrollerWithMarket = await Dollar.at(await this.comptrollerWithMarket.cdsd());
    });

    describe("no DSD bonded, no burned DSD", function () {
      beforeEach(async function () {
        await this.comptrollerWithMarket.increaseCDSDSupplyE(new BN(1000));
      });

      it("shares no rewards", async function () {
        expect(await this.dollarFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(new BN(0));
        expect(await this.cdsdFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(new BN(0));

        expect(
          await this.dollarFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(0));
        expect(
          await this.cdsdFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(0));
      });
    });

    describe("bonded DSD, no burned DSD", function () {
      beforeEach(async function () {
        await this.comptrollerWithMarket.mintToE(this.comptrollerWithMarket.address, new BN(900000));
        await this.comptrollerWithMarket.incrementTotalBondedE(new BN(900000));

        await this.comptrollerWithMarket.increaseCDSDSupplyE(new BN(1000));
        this.daoContractionRewards = new BN(50); // 5%
      });

      it("shares rewards to dao", async function () {
        expect(await this.dollarFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(
          new BN(900000).add(this.daoContractionRewards),
        );
        expect(await this.cdsdFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(new BN(0));

        expect(
          await this.dollarFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(900000).add(this.daoContractionRewards));
        expect(
          await this.cdsdFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(0));
      });
    });

    describe("bonded DSD, burned DSD", function () {
      beforeEach(async function () {
        await this.comptrollerWithMarket.mintToE(this.comptrollerWithMarket.address, new BN(900000));
        await this.comptrollerWithMarket.incrementTotalBondedE(new BN(900000));

        // burn DSD for cDSD and bond cDSD
        await this.comptrollerWithMarket.mintToE(userAddress, new BN(1000));
        await this.dollarFromComptrollerWithMarket.approve(this.comptrollerWithMarket.address, new BN(1000), {
          from: userAddress,
        });
        await this.comptrollerWithMarket.burnDSDForCDSD(new BN(1000), { from: userAddress });

        await this.comptrollerWithMarket.increaseCDSDSupplyE(new BN(1000));
        this.cDSDSupplyReward = new BN(950); // 95%
        this.daoContractionRewards = new BN(50); // 5%
      });

      it("shares rewards to dao's bonded DSD holders and bonded CDSD holders", async function () {
        expect(await this.dollarFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(
          new BN(900000).add(this.daoContractionRewards),
        );
        expect(await this.cdsdFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(
          new BN(1000).add(this.cDSDSupplyReward),
        );

        expect(
          await this.dollarFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(900000).add(this.daoContractionRewards));
        expect(
          await this.cdsdFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(this.cDSDSupplyReward);
      });
    });

    describe("bonded DSD, burned DSD for bonded cDSD", function () {
      beforeEach(async function () {
        await this.comptrollerWithMarket.mintToE(this.comptrollerWithMarket.address, new BN(900000));
        await this.comptrollerWithMarket.incrementTotalBondedE(new BN(900000));

        // burn DSD for cDSD and bond cDSD
        await this.comptrollerWithMarket.mintToE(userAddress, new BN(1000));
        await this.dollarFromComptrollerWithMarket.approve(this.comptrollerWithMarket.address, new BN(1000), {
          from: userAddress,
        });
        await this.comptrollerWithMarket.burnDSDForCDSDAndBond(new BN(1000), { from: userAddress });

        await this.comptrollerWithMarket.increaseCDSDSupplyE(new BN(1000));
        this.cDSDSupplyReward = new BN(950); // 95%
        this.daoContractionRewards = new BN(50); // 5%
      });

      it("shares rewards to dao's bonded DSD holders and bonded CDSD holders", async function () {
        expect(await this.dollarFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(
          new BN(900000).add(this.daoContractionRewards),
        );
        expect(await this.cdsdFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(
          new BN(1000).add(this.cDSDSupplyReward),
        );

        expect(
          await this.dollarFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(900000).add(this.daoContractionRewards));
        expect(
          await this.cdsdFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(1000).add(this.cDSDSupplyReward));
      });
    });

    describe("cannot increase more cDSD than earnable supply ", function () {
      beforeEach(async function () {
        await this.comptrollerWithMarket.mintToE(this.comptrollerWithMarket.address, new BN(900000));
        await this.comptrollerWithMarket.incrementTotalBondedE(new BN(900000));

        // burn DSD for cDSD and bond cDSD
        await this.comptrollerWithMarket.mintToE(userAddress, new BN(10));
        await this.dollarFromComptrollerWithMarket.approve(this.comptrollerWithMarket.address, new BN(10), {
          from: userAddress,
        });
        await this.comptrollerWithMarket.burnDSDForCDSDAndBond(new BN(10), { from: userAddress }); // can earn only 20 i.e 100% of burned

        await this.comptrollerWithMarket.increaseCDSDSupplyE(new BN(1000));
        this.cDSDSupplyReward = new BN(20); // limit redeemable
        this.daoContractionRewards = new BN(50); // 5%
      });

      it("shares rewards bonded CDSD holders only up to earnable rewards", async function () {
        expect(await this.dollarFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(
          new BN(900000).add(this.daoContractionRewards),
        );
        expect(await this.cdsdFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(
          this.cDSDSupplyReward,
        );

        expect(
          await this.dollarFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(900000).add(this.daoContractionRewards));
        expect(
          await this.cdsdFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(this.cDSDSupplyReward);
      });
    });

    describe("cannot increase more DSD than 20% APY", function () {
      beforeEach(async function () {
        await this.comptrollerWithMarket.mintToE(this.comptrollerWithMarket.address, 9000);
        await this.comptrollerWithMarket.incrementTotalBondedE(9000);

        await this.comptrollerWithMarket.increaseCDSDSupplyE(new BN(1000));
        const daoContractionRewardsCap = Number(9000) * 0.0005 // 5bps capped at 20%APY
        this.totalAfterRewards = Number(9000) + daoContractionRewardsCap

      });

      it("shares rewards to dao's bonded DSD holders", async function () {
        expect(await this.dollarFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(
          new BN(this.totalAfterRewards),
        );
        expect(await this.cdsdFromComptrollerWithMarket.totalSupply()).to.be.bignumber.equal(
          new BN(0),
        );
        expect(
          await this.dollarFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(this.totalAfterRewards));
        expect(
          await this.cdsdFromComptrollerWithMarket.balanceOf(this.comptrollerWithMarket.address),
        ).to.be.bignumber.equal(new BN(0));
      });
    });
  });

  describe.skip("redeemToAccount - legacy", function () {
    beforeEach(async function () {
      await this.comptroller.mintToE(this.comptroller.address, new BN(300));
      await this.comptroller.incrementTotalRedeemableE(new BN(300));
    });

    describe("on single call", function () {
      beforeEach(async function () {
        await this.comptroller.redeemToAccountE(userAddress, new BN(100), new BN(100));
      });

      it("doesnt mint new Dollar tokens", async function () {
        expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(400));
        expect(await this.dollar.balanceOf(this.comptroller.address)).to.be.bignumber.equal(new BN(200));
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(200));
      });

      it("updates total redeemable", async function () {
        expect(await this.comptroller.totalRedeemable()).to.be.bignumber.equal(new BN(200));
      });
    });

    describe("multiple calls", function () {
      beforeEach(async function () {
        await this.comptroller.redeemToAccountE(userAddress, new BN(100), new BN(100));
        await this.comptroller.redeemToAccountE(userAddress, new BN(200), new BN(200));
      });

      it("doesnt mint new Dollar tokens", async function () {
        expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(600));
        expect(await this.dollar.balanceOf(this.comptroller.address)).to.be.bignumber.equal(new BN(0));
        expect(await this.dollar.balanceOf(userAddress)).to.be.bignumber.equal(new BN(600));
      });

      it("updates total redeemable", async function () {
        expect(await this.comptroller.totalRedeemable()).to.be.bignumber.equal(new BN(0));
      });
    });

    describe("call when not enough redeemable", function () {
      beforeEach(async function () {
        await this.comptroller.incrementTotalBondedE(new BN(100));
        await this.comptroller.mintToE(this.comptroller.address, new BN(100));

        await this.comptroller.mintToE(this.comptroller.address, new BN(100));
        await this.comptroller.incrementTotalBondedE(new BN(100));
      });

      it("reverts", async function () {
        await expectRevert(
          this.comptroller.redeemToAccountE(userAddress, new BN(400), new BN(400)),
          "not enough redeemable",
        );
      });
    });
  });

  describe.skip("increaseDebt - legacy", function () {
    beforeEach(async function () {
      await this.comptroller.mintToE(userAddress, new BN(1000));
    });

    describe("on single call", function () {
      beforeEach(async function () {
        await this.comptroller.increaseDebtE(new BN(100));
      });

      it("updates total debt", async function () {
        expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(100));
      });
    });

    describe("multiple calls", function () {
      beforeEach(async function () {
        await this.comptroller.increaseDebtE(new BN(100));
        await this.comptroller.increaseDebtE(new BN(200));
      });

      it("updates total debt", async function () {
        expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(300));
      });
    });

    describe("increase past supply", function () {
      beforeEach(async function () {
        await this.comptroller.increaseDebtE(new BN(100));
        await this.comptroller.increaseDebtE(new BN(300));
      });

      it("updates total debt", async function () {
        expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(350));
      });
    });

    describe("increase past supply", function () {
      beforeEach(async function () {
        await this.comptroller.increaseDebtE(new BN(100));
        await this.comptroller.increaseDebtE(new BN(1000));
      });

      it("updates total debt", async function () {
        expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(350));
      });
    });
  });

  describe.skip("decreaseDebt - legacy", function () {
    beforeEach(async function () {
      await this.comptroller.mintToE(userAddress, new BN(1000));
      await this.comptroller.increaseDebtE(new BN(350));
    });

    describe("on single call", function () {
      beforeEach(async function () {
        await this.comptroller.decreaseDebtE(new BN(100));
      });

      it("updates total debt", async function () {
        expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(250));
      });
    });

    describe("multiple calls", function () {
      beforeEach(async function () {
        await this.comptroller.decreaseDebtE(new BN(100));
        await this.comptroller.decreaseDebtE(new BN(200));
      });

      it("updates total debt", async function () {
        expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(50));
      });
    });

    describe("decrease past supply", function () {
      it("reverts", async function () {
        await expectRevert(this.comptroller.decreaseDebtE(new BN(400)), "not enough debt");
      });
    });
  });

  describe.skip("resetDebt - legacy", function () {
    beforeEach(async function () {
      await this.comptroller.mintToE(this.comptroller.address, new BN(10000));
      const debt = await this.comptroller.totalDebt();
      await this.comptroller.decrementTotalDebtE(debt, "");
      await this.comptroller.incrementTotalBondedE(new BN(10000));
    });

    describe("excess debt", function () {
      beforeEach(async function () {
        await this.comptroller.increaseDebtE(new BN(5000));
        await this.comptroller.resetDebtE(new BN(30));
      });

      it("decreases debt", async function () {
        expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(10000));
        expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(3000));
      });
    });

    describe("equal debt", function () {
      beforeEach(async function () {
        await this.comptroller.increaseDebtE(new BN(3000));
        await this.comptroller.resetDebtE(new BN(30));
      });

      it("debt unchanged", async function () {
        expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(10000));
        expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(3000));
      });
    });

    describe("less debt", function () {
      beforeEach(async function () {
        await this.comptroller.increaseDebtE(new BN(1000));
        await this.comptroller.resetDebtE(new BN(30));
      });

      it("debt unchanged", async function () {
        expect(await this.dollar.totalSupply()).to.be.bignumber.equal(new BN(10000));
        expect(await this.comptroller.totalDebt()).to.be.bignumber.equal(new BN(1000));
      });
    });
  });
});

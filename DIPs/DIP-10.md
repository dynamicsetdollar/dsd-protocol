# DIP- 10

## User Stories

In any state:

- As a user who holds freefloat DSD, I am able to burn DSD for cDSD 1:1
- As a user who holds coupons, I am able to migrate coupons (principal+premium) to cDSD
- As a user who holds cDSD, I am able to bond cDSD to the DAO

When the protocol is in contraction:

- Bonded cDSD receives 95% of contraction rewards (former debt) per epoch
  ..\* As a user with bonded cDSD, I am only able to receive up to 100% of cDSD that I have bonded to the DAO
- Bonded DSD receives 5% of contraction rewards per epoch (capped at 0.006% > 20% APY)
- As a user I am not able to buy coupons anymore (as there is no debt anymore)
- As a user who holds freefloat or bonded cDSD, I am NOT able to redeem cDSD for DSD

When the protocol is in expansion:

- As a user who holds cDSD bonded to the DAO, I am able to redeem a partial amount of my bonded cDSD for DSD 1:1 per epoch.
  ..\* While there are unredeemable cDSD, 50% of expansion rewards get distributed to cDSD distributers, pro-rata to their holdings, making them redeemable 1:1 to DSD
- As a user who holds freefloat cDSD, I am NOT able to redeem my cDSD for DSD.

## Requirements

**DSD**: No changes to the ERC20 token (aka freefloat DSD)

**cDSD**: New ERC20 token which represents protocol contraction rewards (former debt as coupons)

**DAO**: Same but with additional features:

1. Mints cDSD in exchange for DSD 1:1 when TWAP < $1
1. Mints cDSD in exchange for coupons (principal + premium)
1. Permits cDSD to be bonded
1. Provides 95% of contraction rewards to bonded cDSD users
1. Provides 5% of contraction rewards to bonded DSD users
1. Redeems bonded cDSD for DSD when TWAP > $1 on a partial basis. 50% of the amount designated for expansion rewards are distributed to cDSD redemption per epoch

**Coupons**: Remove ability to purchase and redeem coupons. The goal is to phase it out slowly

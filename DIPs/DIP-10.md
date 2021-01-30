# DIP- 10

## User Stories

In any state:

- As a user who holds freefloat DSD, I am able to burn DSD for CDSD 1:1
- As a user who holds coupons, I am able to migrate coupons (principal+premium) to CDSD
- As a user who holds CDSD, I am able to bond CDSD to the DAO

When the protocol is in contraction:

- Bonded CDSD receive 95% of contraction rewards (former debt) per epoch
- Bonded DSD receive 5% of contraction rewards per epoch (capped at 0.006% > 20% APY)
- As a user I am not able to buy coupons anymore (as there is no debt anymore)
- As a user who holds freefloat or bonded CDSD, I am NOT able to redeem CDSD for DSD

When the protocol is in expansion:

- As a user who holds CDSD bonded to the DAO, I am able to redeem a partial amount of my bonded CDSD for DSD 1:1 per epoch.
  ..\* While there are unredeemable CDSD, 50% of expansion rewards get distributed to CDSD distributers, pro-rata to their holdings, making them redeemable 1:1 to DSD
- As a user who holds freefloat CDSD, I am NOT able to redeem my CDSD for DSD.

## Requirements

**DSD**: No changes to the ERC20 token (aka freefloat DSD)

**CDSD**: New ERC20 token which represents protocol contraction rewards (former debt as coupons)

**DAO**: Same but with additional features:

1. Mints CDSD in exchange for DSD 1:1 when TWAP < $1
1. Mints CDSD in exchange for coupons (principal + premium)
1. Permits CDSD to be bonded
1. Provides 95% of contraction rewards to bonded CDSD users
1. Provides 5% of contraction rewards to bonded DSD users
1. Redeems bonded CDSD for DSD when TWAP > $1 on a partial basis. 50% of the amount designated for expansion rewards are distributed to CDSD redemption per epoch

**Coupons**: Remove ability to purchase and redeem coupons. The goal is to phase it out slowly

### ABI changes (new functions to be added & removed)

- Additions:

  **DAO**

  `function exchangeDSDForCDSD(uin256 amount) external onlyContraction // exchange DSD for CDSD for the msg.sender`

  `function exchangeCouponsForCDSD(uin256 amount) external onlyContraction // exchange Coupons for CDSD for the msg.sender`

  `function mintCDSD(uin256 amount) internal // mint CDSD to the msg.sender, used in exchange* functions`

  `function bondCDSD(uin256 amount) external // bond CDSD to the msg.sender`

  `function exchangeDSDForCDSDAndBond(uin256 amount) external onlyContraction // exchange DSD for CDSD plus bond to DAO for the msg.sender`

  `function exchangeCouponsForCDSDAndBond(uin256 amount) external onlyContraction // exchange Coupons for CDSD plus bond to DAO for the msg.sender`

  `function bondCDSD(uin256 amount) internal // bond CDSD to the msg.sender, used in bond CDSD functions`

  `function redeemCDSD() external onlyExpansion() // redeems redeemable bonded CDSD to DSD for the msg.sender `
  `function redeemCDSD(uin256 amount) internal onlyExpansion() // calculates redeemable CDSD. Supports redeemCDSD external function`

- Removals

  **DAO**

  `function purchaseCoupons(uint256 amount) external returns (uint256)`

  `function redeemCoupons(uint256 couponEpoch, uint256 amount, uint256 minOutput) external`

### Define new state / variables we need to track

```
struct State10 {
      mapping(address => uint256)) bondedCDSD;
      address cdsd;
  }
```

`Storage.State10 _state10;`

```
function cdsd() public view returns (IDollar) {
      return _state10.cdsd;
}
```

```
function totalCDSDBonded() public view returns (uint256) {
    return _state10.cdsdBonded;
 }
```

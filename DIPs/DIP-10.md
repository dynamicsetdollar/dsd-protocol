# DIP- 10

## User Stories

In any state:

- As a user who holds freefloat DSD, I am able to burn DSD for cDSD 1:1
- As a user who holds coupons, I am able to migrate coupons (principal+premium) to cDSD
- As a user who holds cDSD, I am able to bond cDSD to the DAO

When the protocol is in contraction:

- Bonded cDSD receive 95% of contraction rewards (former debt) per epoch
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

### ABI changes (new functions to be added & removed)

- Additions:

  **DAO**

  `function burnDSDForCDSD(uint256 amount) external onlyContraction // burn DSD for CDSD for the msg.sender`
  `function burnCouponsForCDSD(uint256 amount) external onlyContraction // burn Coupons for CDSD for the msg.sender`
  `function mintCDSD(uint256 amount) internal // mint CDSD to the msg.sender, used in burn* functions`

  `function bondCDSD(uint256 amount) external // bond CDSD for the msg.sender`
  `function burnDSDForCDSDAndBond(uint256 amount) external // burn DSD for CDSD plus bond to DAO for the msg.sender`
  `function burnCouponsForCDSDAndBond(uint256 amount) external // burn Coupons for CDSD plus bond to DAO for the msg.sender`
  `function bondCDSD(uint256 amount) internal // bond CDSD to the msg.sender, used in bond CDSD functions`
  `function unbondCDSD(uint256 amount) external // unbond CDSD for the msg.sender`

  `function redeemCDSD(uint256 amount) external onlyExpansion() // redeems redeemable bonded CDSD to DSD for the msg.sender `
  `function redeemCDSD(uint256 amount) internal onlyExpansion() // calculates redeemable CDSD. Supports redeemCDSD external function`

- Removals

  **DAO**

  `function purchaseCoupons(uint256 amount) external returns (uint256)`

  `function redeemCoupons(uint256 couponEpoch, uint256 amount, uint256 minOutput) external`

### Define new state / variables we need to track

- State

`uint256 private constant EARNABLE_CAP = 100; // % of capped earnable contraction rewards`

```
struct State10 {
    mapping(address => uint256) cDSDSharesByAccount;
    mapping(address => uint256) earnedCDSD;
    mapping(address => uint256) redeemableCDSD;
    uint256 totalCDSDShares;
    IDollar cDSD;
}
```

`Storage.State10 _state10;`

- Getters

```
function cDSD() public view returns (IDollar) {
    return _state10.cdsd;
}

function totalCDSDShares() public view returns (uint256) {
    return _state10.totalCDSDShares;
}

function balanceOfBondedCDSD(address account) public view returns (uint256) {
    return _state10.cDSDSharesByAccount[account];
}

function balanceOfEarnableCDSD(address account) public view returns (uint256) {
    return _state10.earnableCDSD[account];
}

function balanceOfEarnedCDSD(address account) public view returns (uint256) {
    return _state10.earnedCDSD[account];
}
```

- Setters

```
function incrementTotalCDSDShares(uint256 amount) internal {
    _state10.totalCDSDShares = _state10.totalCDSDShares.add(amount);
}

function decrementTotalCDSDShares(uint256 amount) internal {
    _state10.totalCDSDShares = _state10.totalCDSDShares.sub(amount);
}

function incrementBalanceOfBondedCDSD(address account, uint256 amount) internal {
    _state10.cDSDSharesByAccount[account] = _state10.cDSDSharesByAccount[account].add(amount);
    incrementTotalCDSDShares(amount);
}

function decrementBalanceOfBondedCDSD(address account, uint256 amount) internal {
    _state10.cDSDSharesByAccount[account] = _state10.cDSDSharesByAccount[account].sub(amount);
    _state10.totalCDSDShares = _state10.totalCDSDShares.sub(amount);
}

function incrementBalanceOfEarnableCDSD(address account, uint256 burnedDSDamount) internal {
    uint256 cappedEarnableAmount = burnedDSDamount.add(burnedDSDamount.mul(Constants.getEarnableCap()).div(100));
    _state10.earnableCDSD[account] = _state10.earnableCDSD[account].add(cappedEarnableAmount);
}

function incrementBalanceOfEarnedCDSD(address account, uint256 amount) internal {
    _state10.earnedCDSD[account] = _state10.earnedCDSD[account].add(amount);
    require(_state10.earnedCDSD[account] <= _state10.earnableCDSD[account], "cannot earn more than earnable rewards!");
}

```

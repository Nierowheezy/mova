# 09 — Savings goals

> Plain-language goal: how "set aside money for a goal" works, and where that
> money lives in the ledger.

## 1. The feature

`POST /api/v1/savings` creates a goal (`name`, `targetAmount`, optional
`targetDate`). Money moves between the wallet and a goal:

- **Deposit to goal** — `PATCH …/:uuid/deposit` (money: wallet → goal).
- **Withdraw from goal** — `PATCH …/:uuid/withdraw` (money: goal → wallet),
  only allowed **once the goal target is reached** (that's the product rule:
  you lock your savings until you hit the target).

## 2. Ledger model

A savings goal is its own ledger account (`goal:<uuid>`, type
`SAVINGS_GOAL`), so a user's money is split across two "buckets" that the
double-entry system tracks separately:

- Deposit to goal: `wallet DEBIT → goal CREDIT`.
- Withdrawal: `goal DEBIT → wallet CREDIT` (reversal pair).

`SavingsGoal.currentAmount` must always equal
`ledger_accounts("goal:<uuid>").balance` — same invariant style as wallets.

## 3. Concurrency safety (same discipline as transfers)

Both movements run in `prisma.$transaction` and:

- `SELECT … FOR UPDATE` on the wallet row (deposit) / the goal row
  (withdrawal), re-checking balances **from the locked value**.
- Deposit: insufficient balance → `INSUFFICIENT_FUNDS`.
- Withdrawal: goal not reached → `GOAL_NOT_REACHED`; empty goal →
  `NOTHING_TO_WITHDRAW`.
- Write `Transaction` rows (type `SAVINGS`, `externalReference = goal.uuid`)
  + notifications inside the same transaction.

## 4. Notes & known rough edges

- Deposits to goals are **not** currently run through the tier-based daily
  limits (transfers/deposits/withdrawals are). If abuse shows up, wire savings
  into `enforceTransactionLimits` too.
- `withdrawFromGoal` swipes the **entire** goal balance when triggered
  (`currentAmount → 0`), not a partial amount — intentional for the MVP
  "lock until target" rule.
- Goal creation writes a `SAVINGS` transaction with `amount: 0` and the goal
  uuid as reference — it's the audit breadcrumb for goal lifecycle, not money
  movement (no ledger pair is posted for creation).

Next: KYC, tiers & AML → [10-kyc-and-aml.md](./10-kyc-and-aml.md)
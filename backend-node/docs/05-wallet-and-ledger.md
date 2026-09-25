# 05 — Wallets & the ledger

> Plain-language goal: understand where a customer's money *actually* lives
> and how the system proves it is always correct.

## 1. The two views of the same money

- **`wallets.balance`** — the customer-visible number (fast reads, the UI
  shows this).
- **`ledger_entries` / `ledger_accounts`** — the accounting truth. Every
  change to `wallets.balance` *must* come with a DEBIT/CREDIT pair in the
  ledger.

**The invariant:** for wallet id `N`,
`wallets.balance` **===** `ledger_accounts("wallet:N").balance`
at all times. The test suite asserts this after real transfers
(`tests/transfer.integration.test.ts`) via `getWalletLedgerBalance`.

## 2. The ledger service (`src/services/ledger.service.ts`)

Public helpers every money module uses:

| Helper | Meaning |
| --- | --- |
| `walletAccountId(walletId)` | `"wallet:<id>"` — the ledger account for a wallet |
| `goalAccountId(uuid)` | `"goal:<uuid>"` — savings goal account |
| `PLATFORM_ACCOUNT_ID` | `"platform"` — the platform/house settlement account |
| `LEDGER_TYPES` | `CUSTOMER_WALLET` / `SAVINGS_GOAL` / `PLATFORM` |
| `postDoubleEntry(tx, { debit, credit, amount, txRef })` | Writes BOTH sides inside the caller's `$transaction`, updating running `balanceAfter`, and enforcing **non-negative** balances for customer/goal accounts |

Notes:

- Only `CUSTOMER_WALLET` and `SAVINGS_GOAL` accounts are kept non-negative.
  The `platform` (house) account may go negative — it's the settlement side
  that holds the mirror image of all customer money, so its sign flips
  naturally (e.g. a deposit is `platform DEBIT` even when platform holds
  nothing yet).
- `LedgerEntry` rows are **immutable**: never update or delete. Corrections
  are new reversing entries.
- Transfers post one pair `(sender DEBIT → receiver CREDIT)`; deposits post
  `(platform DEBIT → wallet CREDIT)`; withdrawals post `(wallet DEBIT →
  platform CREDIT)`; refunds reverse the pair.

## 3. Wallet tables

`wallets` (one per user, `walletId` unique public handle) and
`savings_goals` (per-wallet goals) are straightforward state tables whose
rows the ledger keeps honest.

## 4. Reading the ledger (reconciliation)

For auditing or debugging a balance discrepancy:

```sql
-- All entries for a wallet, newest first
SELECT * FROM ledger_entries
WHERE "accountId" = 'wallet:3'
ORDER BY "createdAt";

-- Running balance from the journal
SELECT "balanceAfter" FROM ledger_entries
WHERE "accountId" = 'wallet:3'
ORDER BY "createdAt" DESC LIMIT 1;
```

If this differs from `wallets.balance`, money got moved in a way that bypassed
the ledger — which the code should never do, and which tests now guard
against. `scripts/backfill-ledger.ts` brings pre-ledger wallets into the
ledger so the invariant holds on existing environments.

## 5. Why Decimal, why cents-safe arithmetic

Money is `Decimal(12, 2)`. Floating point can't represent `0.1` exactly, and
in money code that turns into "your balance is 10.00000001". Stripe amounts
are passed as integer **cents** (`amount * 100`), and webhook verification
compares recorded cents against `event.amount` in cents — never float-relying
comparisons.

Next: transfers → [06-transfers.md](./06-transfers.md)
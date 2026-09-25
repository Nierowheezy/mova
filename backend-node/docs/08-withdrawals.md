# 08 — Withdrawals (cash out)

> Plain-language goal: how a customer turns wallet balance into bank-account
> money, and what happens when Stripe fails halfway through.

## 1. Preconditions

To withdraw, a user must have completed **Stripe Connect onboarding**
(`stripeAccountId` set — see `connect/` module). Without it:
`400 STRIPE_CONNECT_NOT_ONBOARDED`.

## 2. The flow at a glance

```
POST /api/v1/withdraw        amount + idempotencyKey (uuid, required)
   │
   ├─ fraud limits (tier-based, like transfer/deposit)
   │
   ├─ STEP 1 (DB transaction — atomic):
   │    • claim idempotency key
   │    • SELECT ... FOR UPDATE (wallet)         ← lock
   │    • balance check on the locked row
   │    • wallet −= amount
   │    • Transaction row: WITHDRAWAL, amount −amount, PENDING
   │    • ledger: wallet DEBIT → platform CREDIT
   │    • cache response under the key
   │
   ├─ AML hook (fire-and-forget)
   │
   ├─ STEP 2 (Stripe, best-effort):
   │    • stripe.transfers.create (platform → connected account)
   │    • stripe.payouts.create (to the user's bank, idempotencyKey passed)
   │    • save payout.id as externalReference
   │
   ├─ SUCCESS → { status: "PENDING", payoutId, ... }  (final credit settles
   │            when payout.paid webhook arrives)
   │
   └─ STRIPE FAILS → COMPENSATION:
        • reverse the internal debit: wallet += amount, Transaction → FAILED,
          ledger reversal pair (platform DEBIT → wallet CREDIT)
        • idempotency key caches the failure
        • respond 502 WITHDRAWAL_FAILED
```

## 3. Why debit-first, then compensate (and the safer alternative)

The order used to be dangerous: call Stripe *first*, then record — if the DB
write then failed, money left with no trace. We flipped it:

- **Debit atomically inside the DB first.** The user's balance is debited
  exactly once, recorded PENDING with a reference.
- **Then call Stripe.** If Stripe fails, a **compensating reversal** restores
  the wallet and marks the transaction FAILED. Every path leaves an audit
  trail.

**The even-safer design** (documented as future hardening): don't debit at
request time at all — debit only when `payout.paid` arrives. That's fully
reconciliation-safe but means the user keeps the balance longer and the API
must manage more states. We chose optimistic-debit + compensation because it
gives deterministic UX with a tested rollback path. `tests/withdraw.integration.test.ts`
mocks Stripe failing to prove the refund works.

## 4. Settlement (webhooks)

- `payout.paid` → Transaction → `SUCCESSFUL`.
- `payout.failed` → **refund**: wallet += amount, Transaction → FAILED, ledger
  reversal — guard under `FOR UPDATE` so a duplicate webhook can't refund
  twice (see [11-webhooks-stripe.md](./11-webhooks-stripe.md)).

Both come over the **Connect webhook** (`/webhook/stripe-connect`) with its
own secret + raw-body signature verification.

## 5. Idempotency

The uuid `idempotencyKey` is passed to Stripe's payout call (Stripe side) AND
claimed locally with the response cached (local side) — a double-tap can
neither create two payouts nor two debits.

## 6. Contract notes for the frontend

- Withdraw returns `PENDING`; poll `GET /api/v1/transactions/:reference` for
  the eventual `SUCCESSFUL`/`FAILED`.
- `idempotencyKey` is **required** — generate a uuid per attempt.

Next: savings goals → [09-savings-goals.md](./09-savings-goals.md)
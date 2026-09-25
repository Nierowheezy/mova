# 06 — Transfers (P2P)

> Plain-language goal: explain how money moves between two wallets and how the
> system physically prevents two people from spending the same dollar at the
> same time.

## 1. What a transfer is

`POST /api/v1/transfer` moves `amount` from the caller's wallet to another
wallet by walletId. One economic event; two customer-facing `Transaction`
rows (one per wallet) sharing a single `externalReference`, so statements look
right on both sides and the daily-limit meter counts the event once.

## 2. The checks, in order (`transfer.service.ts`)

1. **Idempotency fast-path** — same key → same response.
2. **Load caller** — wallet, KYC, freeze status.
3. **PIN lockout** — locked → 403. Wrong PIN 5× → lock 15 min.
4. **PIN correct?** (bcrypt compare).
5. **KYC gate** — must be VERIFIED (`KYC_NOT_VERIFIED` otherwise).
6. **Destination** — exists, not yourself, not frozen.
7. **Fraud limits** — per-tx cap + rolling-24h aggregate from the tier
   (`services/limits.service.ts`).

Only then does the money move.

## 3. The atomic core — no double-spend, ever

```ts
await prisma.$transaction(async (tx) => {
  // 1. claim idempotency key (unique constraint = race-safe)
  // 2. SELECT id, balance FROM wallets WHERE id = ? FOR UPDATE   ← LOCK
  //    ... same for receiver
  // 3. if (senderLocked.balance < amount) throw INSUFFICIENT_FUNDS
  // 4. decrement sender / increment receiver
  // 5. create 2 Transaction rows (shared externalReference)
  // 6. postDoubleEntry (sender DEBIT → receiver CREDIT)
  // 7. reset PIN counters, save beneficiary, write notifications
  // 8. cache the response under the idempotency key
});
```

`FOR UPDATE` means: if two requests try to spend the same balance
simultaneously, the second one **blocks on the lock** until the first
commits, then reads the fresh balance and sees `INSUFFICIENT_FUNDS`. The test
"never lets concurrent transfers overspend the balance" proves this with two
parallel 60-of-100 requests asserting exactly one succeeds.

## 4. AML hook

After a committed (non-replayed) transfer, `aml.service` evaluates it
fire-and-forget (see [10-kyc-and-aml.md](./10-kyc-and-aml.md)). It can never
fail the transfer.

## 5. Response

```
{ success: true, data: {
    transferId, amount,
    from: { user, walletId, newBalance },
    to:   { user, walletId },
    status: "SUCCESSFUL", timestamp } }
```

Transfers are internal and atomic, so they return SUCCESSFUL immediately —
unlike deposits/withdrawals that depend on Stripe.

## 6. Edge cases handled

| Case | Behavior |
| --- | --- |
| Self-transfer | `400 SELF_TRANSFER` |
| Frozen sender | `403 ACCOUNT_FROZEN` |
| Frozen receiver | `403 RECEIVER_FROZEN` |
| Insufficient funds | `400 INSUFFICIENT_FUNDS` (checked on the locked row) |
| Unverified KYC | `403 KYC_NOT_VERIFIED` |
| Over tier limits | `400 TX_LIMIT_EXCEEDED` / `DAILY_LIMIT_EXCEEDED` |
| Wrong PIN repeated | lockout after 5 |

Next: deposits → [07-deposits.md](./07-deposits.md)
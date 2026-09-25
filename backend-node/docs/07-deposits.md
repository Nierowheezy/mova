# 07 — Deposits (funding the wallet)

> Plain-language goal: how a customer adds real money to their wallet, and why
> the wallet is NOT credited at the moment they click "deposit".

## 1. The flow at a glance

```
POST /api/v1/deposit              paymentMethodId + amount + idempotencyKey
   │
   ├─ 1. Stripe PaymentIntent created (amount in cents, allow_redirects: never)
   ├─ 2. PENDING Transaction row recorded (externalReference = paymentIntent.id)
   ├─ 3. PaymentIntent confirmed (card charge)
   └─ returns { status: "PENDING", depositId, paymentIntentId, clientSecret? }
                                                     ↓ (later)
Stripe webhook payment_intent.succeeded  ← THE ONLY THING THAT CREDITS
   ├─ verify signature  (500 → Stripe retries)
   ├─ dedupe by event id (webhook_events)
   ├─ lock the deposit row (FOR UPDATE, status must be PENDING)
   ├─ verify amount: event.amount(cents) === tx.amount * 100
   ├─ wallet += amount, Transaction → SUCCESSFUL
   └─ ledger: platform DEBIT → wallet CREDIT
```

## 2. The core decision: webhook-authoritative crediting

Only Stripe **knows** the payment actually succeeded. If the request path
credited the wallet optimistically and the charge later failed or declined,
the platform would have issued real balance for a payment it never received.
So:

- The request only **records intent** as a PENDING `Transaction` with
  `externalReference = paymentIntent.id`.
- The **`payment_intent.succeeded` webhook** is the single writer that flips
  the wallet. It is:
  - **Signature-verified** (500 on mismatch/processing error → Stripe retries),
  - **deduplicated** by `eventId`,
  - **row-locked** (a redelivered event can't double-credit),
  - **amount-verified** (`event.amount` in cents must equal recorded cents) —
    a mismatch leaves the deposit PENDING and logs an alert for manual
    reconciliation instead of crediting the wrong amount.
- `payment_intent.payment_failed` marks the deposit `FAILED` so the client's
  status polling knows it did not land, and the idempotency key caches the
  failure so a retry with the same key does not re-charge.

## 3. Idempotency (why the key is mandatory)

The client generates a **uuid `idempotencyKey`** (DTO requires it). It is:

1. passed to Stripe as the PaymentIntent's idempotency header (Stripe replays
   identical calls under a key → no double charge), and
2. claimed inside the local DB transaction (unique constraint) where the
   response is cached for 24h — so a resent request returns the original
   response.

Result: double-taps, retries and network resends can never create two
charges or two credits.

## 4. 3DS / redirects (current stance)

Compliance-minded platforms generally want 3-D Secure for cards. Today we use
`allow_redirects: "never"` (cards/EBT scope) and surface
`clientSecret` + `requiresAction` if Stripe ever asks for action — the
frontend can finish 3DS client-side. Making redirects the default is a
one-line change when the product wants it.

## 5. Frontend contract (important — changed in this hardening)

Deposits now return **`status: "PENDING"` + `depositId`**. The frontend must
**poll** the transaction status (`GET /api/v1/transactions/:reference`) until
`SUCCESSFUL` (or `FAILED`), instead of assuming the wallet balance updated
instantly.

## 6. Failure paths

| Path | Behavior |
| --- | --- |
| Charge declined at confirm | Deposit → FAILED; idempotency key caches the failure; client sees `PAYMENT_FAILED` |
| Webhook can't verify signature | 400 (not a Stripe call) |
| Webhook processing error | 500 → Stripe retries (backoff) |
| Amount mismatch at webhook | No credit; deposit stays PENDING; alert logged for reconciliation |
| Duplicate webhook delivery | Dedup by eventId; second delivery acked as already processed |

Next: withdrawals → [08-withdrawals.md](./08-withdrawals.md)
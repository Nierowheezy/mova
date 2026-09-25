# 11 — Stripe webhooks (the money authority)

> Plain-language goal: how the system learns from Stripe that money actually
> moved, and how it guarantees "exactly once" processing even though Stripe
> redelivers events.

## 1. Where webhooks mount (and why it matters)

In `app.ts`, the webhook router is registered **before** `express.json()` and
uses its own `bodyParser.raw()`. Stripe's signature is computed over the
**exact bytes** of the body; if Express had already parsed it into JSON, the
verification would fail for every event. This ordering was a real bug in the
past — it's now a permanent, commented invariant.

Endpoints:
- `POST /webhook/stripe` — standard events (`payment_intent.succeeded`,
  `payment_intent.payment_failed`). Secret: `STRIPE_WEBHOOK_SECRET`.
- `POST /webhook/stripe-connect` — Connect events (`payout.paid`,
  `payout.failed`). Secret: `STRIPE_CONNECT_WEBHOOK_SECRET`.

## 2. Exactly-once, in four guards

| Guard | Mechanism |
| --- | --- |
| Signature | `stripe.webhooks.constructEvent(raw, sig, secret)` — invalid → 400 |
| Deduplication | store `webhook_events.eventId` (unique) before/after processing; seen → ack as `deduplicated` |
| Row lock | the affected `Transaction` row is `SELECT … FOR UPDATE`; only `PENDING` rows are acted on |
| Amount check (deposits) | `event.amount` (cents) must equal `tx.amount * 100` — mismatch → no credit, stays PENDING, alert |

## 3. Error contract with Stripe

- **2xx** → "I processed it" (or it's a verified duplicate). Stripe stops
  retrying.
- **5xx** → "something failed, please redeliver". Stripe retries with
  exponential backoff.
- Processing failures therefore return `500` *without* recording the event id,
  so the retry gets a fresh attempt.

## 4. The handlers

### `payment_intent.succeeded` (deposit credit)
1. Lock the deposit row by `external_reference = paymentIntent.id`.
2. Require `status = PENDING` (prevents double-credit).
3. Verify cents match. If not → skip credit + alert (deposit waits for manual
   reconciliation).
4. `wallet += amount`, `Transaction → SUCCESSFUL`, ledger pair
   `platform DEBIT → wallet CREDIT`.
5. Fire the AML evaluation.

### `payment_intent.payment_failed` (deposit fail)
Mark the matching PENDING deposit `FAILED` so status polling shows the truth.

### `payout.paid` (withdrawal settled)
Mark `external_reference = payout.id` PENDING withdrawal `SUCCESSFUL`.

### `payout.failed` (withdrawal refund)
Under lock: refund wallet, mark `FAILED`, post the ledger reversal pair —
duplicate deliveries can't refund twice.

## 5. Reasons an event gets "skipped" (not an error)

- `DEPOSIT_NOT_FOUND` — a payment intent we don't recognize (orphan). Logged
  for reconciliation.
- `ALREADY_PROCESSED` — duplicate delivery, already credited.
- `AMOUNT_MISMATCH` — stayed PENDING; ops must reconcile the intent.

## 6. Operational guidance for Stripe setup

- Dev: `stripe listen --forward-to localhost:8000/webhook/stripe` and
  `--forward-to localhost:8000/webhook/stripe-connect` with two listeners;
  copy the two `whsec_…` secrets into `.env`.
- Prod: register the two HTTPS endpoints in the Stripe dashboard and enable
  exactly the event types above (+ `payment_intent.*` as needed). Keep
  secrets in a secret manager, not the repo.
- Next step (documented): move handlers onto a **queue** (BullMQ/Valkey) with
  dead-letter retries so a bad event can't stall the request path
  (see [17-scaling-and-load.md](./17-scaling-and-load.md)).

Next: uploads & storage → [12-uploads-and-storage.md](./12-uploads-and-storage.md)
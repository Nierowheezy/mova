# 13 — Idempotency (retries can never double-charge)

> Plain-language goal: when a user double-taps "deposit", or the network
> resends the same request, the system must act exactly once. This is the
> single most important fintech guarantee after ACID — Stripe refuses to
> process payments from platforms that don't have it.

## 1. The mechanism in one picture

Every money-mutating endpoint accepts an **`idempotencyKey`** (a client
generated uuid):

```
Client: POST /deposit { amount, idempotencyKey: "8f…aa" }      (tap 1)
Server: PaymentIntent created with idempotencyKey "8f…aa"       (Stripe)
        Transaction PENDING + idempotency_keys row (key unique)  (local DB)

Client: POST /deposit { amount, idempotencyKey: "8f…aa" }      (tap 2)
Server: sees the key → returns the cached original response.
        Stripe sees the key → replays the original PaymentIntent.
        → No second charge. No second transaction. No double credit.
```

Two rails work together:
1. **Stripe-side** — the same key goes into Stripe's request as its
   idempotency header, so Stripe won't create a second PaymentIntent/Payout.
2. **Local-side** — `IdempotencyKey` table (key `@unique`, TTL 24h) caches
   the response. Claiming the key happens **inside the money transaction**
   under the unique constraint, so even two requests that race each other
   can't both proceed: one claims the key, the other reads the cached
   response.

## 2. Per-endpoint rules

| Endpoint | Key optional? | Why |
| --- | --- | --- |
| `POST /deposit` | **Required** (uuid) | External money + webhook crediting; a retry would create a second charge |
| `POST /withdraw` | **Required** (uuid) | External payout; a retry would create a second bank transfer |
| `POST /transfer` | Optional | Internal atomic op — but recommended; replays return the cached result |

Optional keys are still asserted by the DTO (`uuid` format). The generator
helper lives in `src/shared/utils/generateIdempotencyKey.ts`.

## 3. Failure caching (the subtle half)

A key should also remember **failures**:

- A deposit whose card was declined stores `{ success: false, message }`; a
  retry with the same key returns `400 OPERATION_FAILED_PREVIOUSLY` instead
  of trying to charge again.
- A withdrawal whose Stripe call failed and was compensated does the same.

## 4. What can still go wrong (honest limits)

- **TTL = 24h.** A client that retries the same key after 24h starts a *new*
  operation. Clients should keep their key/attempt correlation short.
- **Key reuse across different payloads** is the client's responsibility —
  the API trusts the key. Document that keys are per-operation.
- Replay of an idempotent response is exact; it does **not** re-run AML
  (guarded by the `committed` flag) so aggregates aren't double-counted.

## 5. How it's proven

`tests/transfer.integration.test.ts` (replays an idempotency key without
double-charging), `tests/deposit.integration.test.ts` and
`tests/withdraw.integration.test.ts` (required-key DTO validation). The
concurrent-claim race is exercised by the transfer locking tests.

Next: errors, validation & DTOs → [14-errors-validation-dtos.md](./14-errors-validation-dtos.md)
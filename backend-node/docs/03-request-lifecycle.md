# 03 — Request lifecycle (what happens per request)

> Plain-language goal: trace one call — "POST /api/v1/transfer" — from the
> moment it hits the server to the moment the user sees a response, naming
> every file touched.

## 1. The stack order (from `src/app.ts`)

For every request, top to bottom:

| # | Middleware | File | What it does |
| --- | --- | --- | --- |
| 1 | `helmet()` | app.ts | Security headers (HSTS, X-Content-Type-Options, …) |
| 2 | `cors()` | app.ts | Allows only `CLIENT_URL`, with credentials (cookies) |
| 3 | `/webhook` router | `webhook/webhook.routes.ts` | **Mounted before body parsing** — needs the raw body for Stripe signatures |
| 4 | `express.json()` / `urlencoded` / `cookieParser` | app.ts | Parses JSON/form bodies + cookies (body limit 10 MB) |
| 5 | `requestIdMiddleware` | `shared/middleware/requestId.middleware.ts` | Gives the request an id for log correlation |
| 6 | `metricsMiddleware` (if `METRICS_ENABLED`) | `shared/middleware/metrics.middleware.ts` | Records request duration/count into Prometheus histograms (normalized route labels) |
| 7 | `logger` | `shared/middleware/logger.middleware.ts` | Structured pino log per request |
| 8 | `apiLimiter` | `shared/middleware/rateLimiter.ts` | 100 requests / 15 min / user-or-IP |
| 9 | Route handlers | `modules/**/routes.ts` | The actual feature logic |
| 10 | `notFoundHandler` + `errorHandler` (+ Sentry) | `shared/middleware/errorHandler.ts`, `config/sentry.ts` | Standard 404 / error envelope; captured to Sentry if a DSN is set |

> Health and metrics endpoints bypass the API limiter deliberately: `/healthz`
> (liveness, no DB), `/readyz` (readiness, DB `SELECT 1`), and `/metrics`
> (Prometheus scrape) are mounted before `apiLimiter` — they must stay
> reachable under load. See [19-observability-and-runbooks.md](./19-observability-and-runbooks.md).

If any middleware's guard trips (rate limit, validation, auth), the request
short-circuits straight to `errorHandler` with a clean envelope — it never
reaches the service.

## 2. Trace a real mutation: `POST /api/v1/transfer`

1. **Route** (`modules/transfer/transfer.routes.ts`) applies in order:
   `authenticate` → `transactionLimiter` (10 tx / 5 min / user) →
   `validate(TransferSchema)`. Already-garbage bodies die here with
   `400 VALIDATION_ERROR` and never touch the DB.
2. **Controller** (`transfer.controller.ts`) copies `req.user?.userId` and the
   validated body into the service. It holds no business rules.
3. **Service** (`transfer.service.ts`) — the interesting part:
   - **Idempotency fast-path:** if the client sent an `idempotencyKey` that we
     already have a response for, we return the cached response (no re-run).
   - **Load caller** (wallet, KYC status, freeze flag, PIN lockout counters).
   - **PIN checks:** locked? → `403 PIN_LOCKED`. Wrong PIN 5× → lock 15 min.
   - **KYC gate:** tier/BASIC without VERIFIED KYC → `403 KYC_NOT_VERIFIED`.
   - **Destination checks:** wallet exists, not yourself, not frozen.
   - **Fraud limits:** `limits.service.enforceTransactionLimits` — per-tx cap
     and rolling-24h aggregate from the user's tier.
   - **The money transaction:** `prisma.$transaction(async tx => …)`:
     a. Claim the `idempotencyKey` (unique constraint stops concurrent dupes).
     b. `SELECT … FOR UPDATE` **both** wallet rows.
     c. Re-check balance from the **locked** row; decrement sender, increment
        receiver.
     d. Create two `Transaction` rows sharing one `externalReference`.
     e. `postDoubleEntry` — sender DEBIT, receiver CREDIT.
     f. Reset PIN lockout, maybe save beneficiary, write notifications.
     g. Cache the response under the idempotency key.
   - **AML hook (non-blocking):** after commit, `aml.service` evaluates the
     transfer in the background (fire-and-forget) for the ops queue.
4. **Response** → `200 { success, data: { transferId, … } }`, or a
   `4xx/5xx` error envelope.

## 3. Trace a read: `GET /api/v1/wallet`

`wallet.routes.ts` → `wallet.controller.getMyWallet` → `wallet.service`
(`findUnique` where `userId`) → minimal projection (`walletId`, `balance`,
`createdAt`, user `{ email, username, tier, isFrozen }`). Lookups of *other*
people's wallets go through `getWalletByWalletId` which returns only
`{ walletId, username, verified }` — deliberately PII-safe.

## 4. Trace an error

Every thrown `AppError(code, message, httpStatus)` and every Prisma/zod
failure funnels into `errorHandler`:

```
{ success: false, error: { code, message, details? } }
```

Unknown internal errors become a `500` envelope with the real stack logged,
never leaked to the client.

## 5. Async / background work

Currently only one background path: **AML evaluation** after money commits.
Everything else is request-synchronous. Stripe webhooks are *synchronous
in-process* handlers that must return `2xx` to acknowledge or `5xx` to force
Stripe to retry (see [11-webhooks-stripe.md](./11-webhooks-stripe.md)).

Next: [04-auth-security.md](./04-auth-security.md))
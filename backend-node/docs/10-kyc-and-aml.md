# 10 — KYC, account tiers & AML

> Plain-language goal: how identity is verified, how that gates what a customer
> can do (tiers), how the system watches for money laundering, and how ops
> reviews all of it.

## 1. KYC (Know Your Customer)

- `POST /api/v1/kyc` — the user submits `fullName`, `dateOfBirth`, `idType`,
  and `idImage` (the `fileId` returned by `POST /api/v1/upload`).
  Status starts **PENDING**.
- `KYC.fullName` is stored **encrypted at rest** (Prisma `$use` middleware).
- Documents are stored **privately** and only served to the owner or
  ADMIN/SUPPORT via `GET /api/v1/kyc/documents/:fileName` (see
  [12-uploads-and-storage.md](./12-uploads-and-storage.md)).
- Admins review and **approve/reject**:
  - On **approve** (`POST /api/v1/admin/kyc/:kycId/approve`) a **sanctions /
    PEP screening runs FIRST** (`screenAgainstSanctions`, see §4):
    - **Cleared** ⇒ the user is promoted to tier **VERIFIED** inside the same
      transaction and notified.
    - **Not cleared** ⇒ the approval is **DENIED**: KYC → `REJECTED`, a
      CRITICAL `SANCTIONS_SCREEN` AML flag enters the ops queue, the account
      is **frozen**, and the applicant is notified.
  - Manual rejection notifies the user with a reason.

## 2. Account tiers — the limit engine

Tier lives on `users.tier`:

| Tier | How you get there | Per-tx max | Rolling 24h max | Notes |
| --- | --- | ---: | ---: | --- |
| BASIC | Default (registered) | $1,000 | $5,000 | Enough to try the product |
| VERIFIED | KYC approved | $10,000 | $25,000 | Standard production tier |
| PREMIUM | Ops promotes (enhanced due diligence) | $50,000 | $150,000 | High-trust, high-volume |

`src/config/limits.ts` (`LIMITS_BY_TIER`) is the single source of truth.
`limits.service.enforceTransactionLimits` reads the user's tier per call and
enforces per-transaction + rolling-24h aggregates on **transfer, deposit,
withdraw** with error codes `TX_LIMIT_EXCEEDED` / `DAILY_LIMIT_EXCEEDED`.
Admin can change a tier via `PUT /api/v1/admin/users/:userId/tier` (requires a
reason, always audit-logged) — a **downgrade** is how you cap a customer who
starts behaving like a risk.

## 3. AML monitoring (`src/services/aml.service.ts`)

After every money movement (fire-and-forget; it can never block the
transaction), a small rules engine evaluates it against the user's tier
limits and records hits in `aml_flags`:

| Rule | What it catches | Severity |
| --- | --- | --- |
| `LARGE_SINGLE_TX` | One movement ≥ half the tier's daily cap | MEDIUM / HIGH |
| `VELOCITY_24H` | Rolling 24h volume crossing the daily cap | HIGH / CRITICAL |
| `STRUCTURING_24H` | ≥3 small cash-out moves under the per-tx cap in 24h ("smurfing") | MEDIUM / HIGH |
| `NEW_ACCOUNT_MOVES` | Money moved within 14 days of sign-up | MEDIUM |
| `ROUND_AMOUNT` | Whole-dollar amounts (structuring heuristic) | LOW |

Rules combine deposit+transfer+withdrawal volume across instruments so
*layering* (splitting movement across methods) is still visible.

## 4. Sanctions / PEP screening (`src/services/sanctions.service.ts`)

Runs at KYC approval and **blocks** approval when it does not clear:

- `SANCTIONS_PROVIDER=opensanctions` — screen against local OpenSanctions CSV
  exports (free, OFAC/UN/EU consolidated). Download `sanctions.csv` +
  `peps.csv` into `SANCTIONS_DATA_DIR` (see `data/sanctions/README.md`).
- `SANCTIONS_PROVIDER=sandbox` — dev/test convenience; **in production it
  FAILS CLOSED** (approval is denied until a real provider is configured).
- Fail-closed principle: a missing dataset or sandbox-in-production is a
  **deny**, never a pass — you cannot safely launch with the stub.

On a hit (`cleared:false`) `approveKYC` **denies**: KYC → `REJECTED`, a
CRITICAL `SANCTIONS_SCREEN` AML flag lands in the ops queue, and the account
is **frozen** (no further money moves) until ops reviews. Every decision is
audit-logged (`KYC_REJECTED_SANCTIONS` / `KYC_APPROVED`). Watchlist matching
uses accent-folding + token-overlap with DOB-year/country filters.

## 5. The ops (admin) workflow

All under `/api/v1/admin`, role-gated:

- `GET /aml/summary` — queue health (open / under review / escalated /
  dismissed / total).
- `GET /aml/flags?status=&severity=&rule=&userId=&page=&limit=` — filtered,
  paginated review queue.
- `GET /aml/flags/:flagId` — flag + user context.
- `POST /aml/flags/:flagId/review` — set `UNDER_REVIEW` / `DISMISSED` /
  `ESCALATED` with a note. Every change is **audit-logged** (who, when, why).
- Escalation typically flows to **freezing the account** (`POST
  /api/v1/admin/users/:userId/freeze`) while a manual review/SAR (suspicious
  activity report) happens.
- **CRITICAL flags auto-freeze the account immediately** — no further money
  moves until an operator reviews (see §4 and the aml.service policy header).
  Ops unfreezes via `POST /api/v1/admin/users/:userId/unfreeze`.

## 6. What a production AML stack adds (roadmap)

1. A commercial sanctions provider (ComplyAdvantage / Trulioo / Persona) for
   fuzzy search, confidence scores and risk scoring — the local OpenSanctions
   matching is a pragmatic token heuristic (names only).
2. **Structuring math with cash-in + cash-out separately** and per-instrument
   thresholds instead of one shared cap.
3. ~~Automatic **account freeze** on CRITICAL flags~~ ✅ done — CRITICAL flags
   (incl. sanctions screening hits) freeze automatically; ops reviews/unfreezes.
4. Watchlist names matching for beneficiary scraping (beneficiary network
   analysis — "who sends money to whom" graphs).
5. Daily **monitoring reports** and a case-management tool for ops.

Next: webhooks → [11-webhooks-stripe.md](./11-webhooks-stripe.md)
# Deployment runbook for the full Mova stack

This repo (`fintech-app`) is the deployable snapshot of both stacks:

- `backend-node/`  Express + Prisma + Stripe API (deployed to **Render**)
- `frontend/`      Vite + React 19 SPA (deployed to **Render static site**;
  `vercel.json` is kept in case you prefer Vercel later)

CI/CD lives in `.github/workflows/`:

| Workflow | When | What it does |
|---|---|---|
| `ci.yml` | every push + PR | backend tests + Docker build, frontend lint + build |
| `deploy-render.yml` | push to main | triggers the Render deploy hook (`RENDER_DEPLOY_HOOK_URL`) |
| `deploy-vercel.yml` | push to main | deploys the SPA via Vercel (`VERCEL_*` secrets) |
| `reconcile-nightly.yml` | nightly | reconciles wallets vs ledger against `PROD_DATABASE_URL` |

---

## 1. Push the repo to GitHub

The repo should be pushed to GitHub first (`gh` CLI is authenticated as
Nierowheezy). Example for a new private repo named `fintech-app`:

```bash
cd fintech-app
git add -A
git commit -m "chore: deployable fintech monorepo (frontend + backend-node)"
gh repo create fintech-app --private --source=. --remote=origin --push
```

If the repo already exists, just add the remote and push instead.

---

## 2. Deploy the backend to Render

> Status: **already deployed and live** at
> https://mova-api-z5gh.onrender.com on the `free` plan (the `starter` plan +
> uploads disk in `render.yaml` need a payment method; see "Production
> readiness checklist"). If a fresh deploy is needed, follow the steps below.

Open the Blueprint:

- Dashboard: **New -> Blueprint** and choose the `fintech-app` repo, or
  deeplink: `https://dashboard.render.com/blueprint/new?repo=<owner>/fintech-app`
- Render reads `render.yaml`, which creates:
  - `mova-api` web service (Docker, `starter` plan, persistent disk at
    `/app/uploads` for KYC uploads)
  - `mova-db` Managed Postgres (`free` plan, 256 MB)
- The Docker entrypoint runs `prisma migrate deploy` automatically on start,
  so migrations land before the server accepts traffic.

### Backend environment variables (fill in Dashboard at apply time)

| Variable | Value |
|---|---|
| `JWT_SECRET` | `openssl rand -base64 48` (>= 32 chars) |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` (exactly 64 hex chars) |
| `STRIPE_PUBLIC_KEY` | Stripe `pk_...` (test or live) |
| `STRIPE_SECRET_KEY` | Stripe `sk_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` for payment_intent events |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `whsec_...` for Connect payout events |
| `STRIPE_CONNECT_CLIENT_ID` | `ca_...` from Stripe Connect settings |
| `RESEND_API_KEY` | Resend API key for emails |
| `FROM_EMAIL` | plain sender address (Resend must verify it) |
| `CLIENT_URL` | the **frontend** URL (CORS allowlist + cookie domain) |
| `FRONTEND_URL` | same frontend URL (used in email links) |
| `SENTRY_DSN` | optional; leave blank to disable error tracking |

`NODE_ENV`, `PORT`, `UPLOAD_DIR`, `DATABASE_URL`, `SANCTIONS_PROVIDER` are
already set by the Blueprint.

### Live deployment values used here

| Variable | Value |
|---|---|
| Backend URL | `https://mova-api-z5gh.onrender.com` |
| Frontend URL (`CLIENT_URL`, `FRONTEND_URL`) | `https://mova-ui.onrender.com` |
| DB | `mova-db` (Render Managed Postgres, free, Oregon, v16) |
| Plans | `mova-api` free (no disk), `mova-db` free |

### Stripe webhooks

After deploy, register the webhook endpoint with Stripe:

- Endpoint URL: `https://mova-api-z5gh.onrender.com/webhook/stripe`
- Events: the `payment_intent.*` suite (deposits) and the Connect payout
  events used by `STRIPE_CONNECT_WEBHOOK_SECRET`.
- Copy the signing secret back into `STRIPE_WEBHOOK_SECRET` /
  `STRIPE_CONNECT_WEBHOOK_SECRET` on Render.

> Deposits only credit a wallet after Stripe sends the webhook. Until the
> webhook URL is registered and the secret is real, fresh users stay at $0.
> The webhook secret is **not set** in the live deployment yet, so deposits
> remain pending until it is registered.

### Rate limiter note

`apiLimiter` is in-memory, 100 req / 15 min per IP. A single Render instance
is fine; do not scale horizontally without replacing it with a shared store.

---

## 3. Deploy the frontend (Render static site, or Vercel)

> Status: **already deployed and live** as a Render static site at
> https://mova-ui.onrender.com (with a SPA rewrite rule so client routes like
> `/login` and `/verify-email?token=...` work on direct navigation). If a
> fresh deploy is needed, follow the steps below.

### Option A: Render static site (used for the live deployment)

Create a New **Static Site** in the Render Dashboard pointing at this repo:

- Build command: `cd frontend && npm ci && npm run build`
- Publish directory: `frontend/dist`
- Branch: `main`

Frontend environment variables (build-time):

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://mova-api-z5gh.onrender.com/api/v1/` |
| `VITE_FRONTEND_URL` | `https://mova-ui.onrender.com` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_...` matching the backend secret |

Then add a Rewrite rule: source `/*` -> destination `/index.html` (type
`rewrite`), so the SPA handles client-side routing.

### Option B: Vercel

The frontend is a plain Vite SPA (`vercel.json` already enables SPA rewrite
routing). Import the repo in Vercel:

- Framework preset: **Vite**
- Root directory: `frontend`
- Build command: `npm run build` (already in `vercel.json`)
- Output directory: `dist` (already in `vercel.json`)

Frontend environment variables (build-time, set in Vercel project):

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://mova-api-z5gh.onrender.com/api/v1/` |
| `VITE_FRONTEND_URL` | your Vercel deployment URL |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_...` matching the backend secret |

```bash
vercel env add VITE_API_URL production
vercel env add VITE_FRONTEND_URL production
vercel env add VITE_STRIPE_PUBLISHABLE_KEY production
```

The local `frontend/.env` is gitignored on purpose: it points at localhost and
must not override the production values.

---

## 4. CI/CD secrets (GitHub Actions)

In **repo Settings -> Secrets and variables -> Actions**:

| Secret | Used by | Needed for |
|---|---|---|
| `RENDER_DEPLOY_HOOK_URL` | `deploy-render.yml` | POST deploy hook (see Dashboard -> mova-api -> Deploy Hook) |
| `VERCEL_TOKEN` | `deploy-vercel.yml` | Vercel deploys from Actions |
| `VERCEL_ORG_ID` | `deploy-vercel.yml` | Vercel team/user id |
| `VERCEL_PROJECT_ID` | `deploy-vercel.yml` | Vercel project id |
| `PROD_DATABASE_URL` | `reconcile-nightly.yml` | nightly ledger reconciliation |
| `OPS_ALERT_WEBHOOK` | `reconcile-nightly.yml` | (optional) drift alert destination |

The deploy workflows no-op gracefully when secrets are missing, so CI never
reds from an unconfigured variable.

---

## 5. Cross-site cookie (already handled in this snapshot)

The refresh token cookie is `httpOnly + Secure + SameSite=None` when
`NODE_ENV == production`, which is required because the frontend
(`mova-ui.onrender.com`) and backend (`mova-api-z5gh.onrender.com`) live on
different sites. Localhost dev keeps `SameSite=Lax`.
See `backend-node/src/shared/utils/cookieHelpers.ts`.

---

## 6. Production readiness checklist

Live deployment status in **bold**:

- [ ] PostgreSQL upgraded from `free` to `standard` for backups + HA
      (currently **free**, expires after the trial period)
- [ ] `mova-api` upgraded from `free` to a paid plan (**free** now) and the
      uploads disk attached, so KYC documents survive redeploys
- [ ] Stripe webhook URLs registered and secrets rotated to real `whsec_`
      (**webhook secret not set yet**; deposits stay pending until done)
- [ ] `SANCTIONS_PROVIDER` switched to `opensanctions` with datasets loaded;
      `sandbox` **fails closed** in production (KYC approvals stay blocked)
- [ ] Resend `FROM_EMAIL` verified, working email flows smoke-tested
      (**`FROM_EMAIL` currently `onboarding@resend.dev`**)
- [ ] Custom domain + TLS on Render (both stacks currently on `*.onrender.com`)
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY` + backend Stripe keys switched to live
      (currently **test keys**)
- [ ] GitHub repo made public if you want it public (default: private)
# fintech-app: Mova full-stack (deployment snapshot)

This folder is the deployable snapshot of the Mova banking app. It contains
exact copies of:

- `backend-node/`  Express + Prisma + Stripe API (Docker-ready)
- `frontend/`      Vite + React 19 SPA

Deployment is fully configured:

- `render.yaml`  - Render Blueprint (API web service + Postgres + uploads disk)
- `frontend/vercel.json` - Vercel SPA config + rewrite
- `.github/workflows/`  - CI, deploy (Render/Vercel), nightly reconciliation
- `DEPLOY.md`    - step-by-step deployment runbook

## Quick start (dev)

```bash
# Backend (http://localhost:8000)
cd backend-node && pnpm install && pnpm prisma:generate && pnpm dev

# Frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

See `DEPLOY.md` for production deployment steps.
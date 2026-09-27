# Project Plan

> One of the two planning docs you provide. Use as much detail as the project
> needs, including rationale, constraints, examples, edge cases, and explicit
> exclusions that should guide later feature work. Draft it directly, develop it
> through any AI conversation, or optionally run `/discovery` for a guided deep
> planning session. The content is always yours to direct. When it is filled in,
> run `/overview` to generate the project overview from this plus `build-plan.md`.

## 1. Problem - What problem are we solving?

Operations teams at a bank move between core banking, fraud tools, KYC queues, CRM, and spreadsheets to answer one question: **"What needs my attention right now, and is it safe to act?"**

The existing Mova backend solved the problem of _how a bank works_ (money movement, ledger, compliance). Mintbank solves the problem of _how the people operating the bank work_. It brings those disjointed jobs into one calm, data-dense operational workspace built around exceptions, not vanity numbers.

## 2. Users - Who is this for?

Internal bank staff. The platform serves seven distinct roles, each seeing the same product with different priorities and permissions:

1.  **Operations Manager** (Primary user) – Sees exceptions across teams, tracks SLA and team workload.
2.  **Fraud & Risk Analyst** – Investigates alerts, needs full context in one screen, blocks/clears/escalates.
3.  **KYC Reviewer** – Compares documents to application, works against a 48h SLA.
4.  **Loan Officer** – Checks DBR and policy limits, requests missing documents.
5.  **Customer Service** – Resolves cases, replies with context and macros.
6.  **Compliance Officer** – Receives escalations, relies on the audit trail.
7.  **Administrator** – Creates roles from templates, controls sensitive permissions.

## 3. Features - What does the MVP need?

- **Work Layer Backend:** New Prisma models for Queues, Cases, Alerts, SLAs, and AuditEvents built on top of Mova.
- **Role-Based Access Control (RBAC):** Expansion of user roles to the 7 operational roles with distinct permissions.
- **Operations Dashboard:** Exceptions-first layout showing "Needs Attention" sorted by priority and SLA.
- **Unified Queues:** Filtered lists for Fraud, KYC, Loans, and Support with SLA countdown timers.
- **Customer 360:** A single, unified view aggregating all Mova data for a specific customer.
- **Investigation Drawer:** A transaction view showing risk scores, "Why flagged" reasons, and controlled action buttons.
- **Controlled Action Workflow:** Irreversible actions (like Block) require a reason, an acknowledgement checkbox, and generate an audit event.
- **KYC Workspace:** A 3-column layout (Application Data | Document Viewer | 6-point Checklist).
- **Support Case Resolution:** Conversation timeline, internal notes, and linked transactions.
- **Mint AI Assistant:** A grounded assistant that answers policy questions but takes no autonomous actions.

## 4. Data - What are we storing?

We will extend the existing Mova database (PostgreSQL/Prisma) with a new "Work" layer:

- **Work Entities:** `Queue`, `Case`, `Alert`, `Task`, `SLA`, `AuditEvent`.
- **Relationships:** Cases will reference existing Mova entities (e.g., `Transaction`, `KYCApplication`, `User`).
- **Metadata:** Priority, status (Open, Under Review, Resolved), assignment (`assigned_to`), SLA deadlines, and resolution reasons.
- **AI Context:** Policy documents (Operations Manual, AML Policy) stored for RAG retrieval.

## 5. Tech - What stack are we using?

We are leveraging the existing Mova codebase and expanding the frontend.

- **Backend:** Existing Mova backend (Express 5 + TypeScript + Prisma + PostgreSQL + Stripe). We will add a new `operations` module and Prisma models.
- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS 4 + daisyUI + React Router 7 + Axios.
- **AI:** RAG pipeline (Vector DB + LLM) for the Mint AI assistant.
- **Infrastructure:** Docker, Render (API + Postgres + Uploads Disk), Vercel/Render (SPA), GitHub Actions (CI/CD).
- **Observability:** Prometheus + Grafana, Sentry, pino structured logging.

## 6. Monetize - How will this make money?

Mintbank is an **internal operations platform**. It is not a direct revenue generator.
Its value is derived from:

- **Cost Savings:** Drastically reducing the time operations staff spend switching between systems.
- **Fraud Prevention:** Faster, more context-rich investigations reduce financial losses.
- **Compliance Adherence:** Reducing the risk of regulatory fines through enforced SLAs, immutable audit trails, and fail-closed sanctions screening.

## 7. UI/UX - How should this look and feel?

**"Calm by default, loud only when it matters."**

- **Aesthetic:** A restrained forest-and-lime palette on a soft grey canvas. Green is reserved for primary actions and positive trends. The interface stays mostly neutral so exceptions stand out.
- **Typography:** _Plus Jakarta Sans_ (warm geometric grotesque) for dense financial data. _JetBrains Mono_ for IDs, account numbers, and transaction references.
- **Accessibility:** Full Arabic RTL support, dark mode tuned for long shifts, and status indicators that use icons + color + labels (never color alone).
- **Layout:** Data-dense but organized. Navigation mirrors how operations teams think: queues of work around a shared customer record.
- **Components:** Exception-first dashboards, queue tables with SLA timers, controlled action panels (with mandatory reason inputs), and a unified Customer 360 view.

## 8. Deployment - Where and how will this ship?

- **Backend (API + Postgres + Uploads Disk):** Render Blueprint (`render.yaml`). Apply from the Render Dashboard.
- **Frontend (SPA):** Render static site or Vercel using `frontend/vercel.json`.
- **CI/CD:** `.github/workflows/ci.yml` builds and tests both stacks on every push. `.github/workflows/reconcile-nightly.yml` runs the money reconciliation job at 03:17 UTC.
- **Environment Variables:**
  - `DATABASE_URL` (Postgres)
  - `JWT_SECRET` (Access tokens)
  - `ENCRYPTION_KEY` (PII encryption)
  - `STRIPE_PUBLIC_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Payments)
  - `RESEND_API_KEY`, `FROM_EMAIL` (Email)
  - `CLIENT_URL`, `FRONTEND_URL` (CORS)
  - `SENTRY_DSN` (Error tracking)
  - `METRICS_ENABLED` (Prometheus metrics)
- **Health Checks:** `/healthz` (liveness), `/readyz` (readiness), `/metrics` (Prometheus scrape).

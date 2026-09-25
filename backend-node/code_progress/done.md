## Complete Inventory: Built vs Remaining

_Audited against the codebase on September 23, 2026._

### ✅ FULLY BUILT (Working & Tested)

| Module                   | Features                                                                    | Status      |
| ------------------------ | --------------------------------------------------------------------------- | ----------- |
| **Project Setup**        | Express 5 + TypeScript + Prisma + PostgreSQL                                | ✅ Complete |
| **Environment Config**   | Zod validation, type-safe env variables                                     | ✅ Complete |
| **Database Schema**      | 13 tables, 6 enums, 11 migrations                                           | ✅ Complete |
| **Authentication**       | Register, Login, Logout, Refresh token rotation + reuse detection           | ✅ Complete |
| **Email Verification**    | Send/verify tokens, password reset flow (Resend)                            | ✅ Complete |
| **2FA (TOTP)**           | Enable/verify/disable, backup codes, QR code                                | ✅ Complete |
| **Password Security**    | Complexity rules, history (last 5), change password, strength checker       | ✅ Complete |
| **Account Security**     | Login attempt tracking, lockout (5 fails / 15 min), freeze/unfreeze         | ✅ Complete |
| **KYC**                  | Submit KYC (PII-encrypted), get profile                                     | ✅ Complete |
| **Admin - KYC**          | View pending/all, Approve, Reject (with audit logs)                         | ✅ Complete |
| **Admin - Users**        | List users, View details, Freeze, Unfreeze, Change role                     | ✅ Complete |
| **Admin - Transactions** | List all, View details, Transaction stats                                   | ✅ Complete |
| **Wallet**               | Get my wallet, Get wallet by ID, Get balance                                | ✅ Complete |
| **Transfer Funds**       | Send money, PIN verification, KYC check, balance check, row locking, idempotency | ✅ Complete |
| **Transaction History**  | List, Filter by type/date/status, detail by reference, pagination           | ✅ Complete |
| **Beneficiary**          | Save contact, List beneficiaries, Delete beneficiary, auto-save on transfer | ✅ Complete |
| **Stripe Funding**       | PaymentIntent, webhook handling, wallet crediting                           | ✅ Complete |
| **Withdrawals**          | Stripe Connect onboarding, payout, `payout.paid`/`failed` webhooks, refunds | ✅ Complete |
| **Savings Goals**        | Create, Deposit, Withdraw on completion, List with progress                 | ✅ Complete |
| **Dashboard**            | Wallet balance, Recent transactions, Savings progress, Notifications count  | ✅ Complete |
| **Notifications**        | List unread, Mark as read, Mark all read                                    | ✅ Complete |
| **Exports**              | CSV transaction export, PDF receipts & account statements                   | ✅ Complete |
| **File Upload**          | Authenticated upload endpoint + static serving (used by KYC)                | ✅ Complete |
| **Production Hardening** | Idempotency keys, audit logs, webhook signatures, rate limiting, request IDs, structured logging, health check, graceful shutdown, Swagger docs | ✅ Complete |

### 🏗️ PARTIALLY BUILT (Need Completion)

| Module           | What's Built                                | What's Missing                       |
| ---------------- | ------------------------------------------- | ------------------------------------ |
| **React frontend** | Auth, dashboard, transfers, transactions, KYC, savings, beneficiaries, notifications, fund/withdraw | 2FA setup UI, profile/settings, password reset UI, CSV/PDF export buttons, admin dashboard UI |
| **Email service**  | Verification + password-reset emails (Resend) | Transaction/login-alert emails       |

### ❌ NOT BUILT YET (Need to Build)

| Module                         | Features                                                    | Priority  |
| ------------------------------ | ----------------------------------------------------------- | --------- |
| **Session management**         | List active sessions (device/IP), force logout              | 🟡 MEDIUM |
| **Scheduled/recurring transfers** | Automate future money movement                          | 🟡 MEDIUM |
| **Support ticket system**      | Users open tickets, admins reply                            | 🟡 MEDIUM |
| **Login alerts (email)**       | Email on new device/IP login (Resend already integrated)    | 🟡 MEDIUM |
| **Password expiration**        | Force change every N days                                   | 🟢 LOW    |
| **Breached password check**    | Reject known-breached passwords (HaveIBeenPwned)            | 🟢 LOW    |
| **Push notifications**         | FCM / APNS                                                  | 🟢 LOW    |
| **Automated tests**            | No test suite exists (no `tests/` dir, no `*.test.ts`)      | 🟡 MEDIUM |
| **Deployment**                 | No Dockerfile, docker-compose, CI workflows, or render.yaml | 🟡 MEDIUM |

### 🧹 Cleanup candidates (found during audit)

- `prisma/schema copy.prisma` – duplicate, safe to delete
- `src/services/email.service copy.ts` – duplicate (fully commented out), safe to delete
- `README.md` files (backend & frontend) are empty (0 lines)

---

## Summary Numbers:

| Category               | Count                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| ✅ Fully built modules | 24 (see table above)                                               |
| 🏗️ Partially built     | 2 (React frontend gaps, email alerts)                              |
| ❌ Not built            | 9 (sessions, recurring transfers, tickets, login alerts, password expiry, breached-password check, push, tests, deployment) |
| 🛡️ Production hardening | 16/16 items implemented                                            |
| 🗄️ Database tables      | 13 models / 6 enums / 11 migrations                                |
| 🔌 API endpoints       | ~59 (16 route modules + health + upload)                           |

---

**Recommended next build:** **Session management** — it's the last auth item from the original roadmap, and everything else on the high-priority list is done.

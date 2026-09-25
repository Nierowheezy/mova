# Pending Work

_Audited against the codebase on September 23, 2026. Items marked ✅ in the original list are now done — see [done.md](./done.md)._

## 🔐 Remaining Auth / Security Items

| Feature                                  | What it does                                                                             | Status  | Estimated effort |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- | ------- | ---------------- |
| **Session management**                   | List active sessions (device, IP, last active) and log out from other devices.           | ⬜ Not started | 2‑3 hours |
| **Login alerts (email)**                 | Email when a new device / IP logs in (Resend is already integrated).                     | ⬜ Not started | 1 hour           |
| **Password expiration policy**           | Force password change every X days (e.g., 90 days).                                      | ⬜ Not started | 1 hour           |
| **Breached password detection**          | Reject passwords found in known breaches (HaveIBeenPwned API).                           | ⬜ Not started | 1‑2 hours        |
| ~~Two‑factor authentication (2FA/TOTP)~~ | ~~Authenticator app + backup codes~~                                                     | ✅ Done  | —                |

## ✨ Other Features (Outside Auth)

| Feature                               | Description                                          | Status       | Effort    |
| ------------------------------------- | ---------------------------------------------------- | ------------ | --------- |
| **Scheduled / recurring transfers**   | Automate future money movement.                      | ⬜ Not started | 2‑3 hours |
| **Support ticket system**             | Users open tickets, admins reply.                    | ⬜ Not started | 3‑4 hours |
| **Push notifications** (optional)     | Real‑time alerts via FCM or similar.                 | ⬜ Not started | 2‑3 hours |
| **Transaction receipts (email)**      | Send PDF receipt via email after each transaction.   | ⬜ Not started | 1 hour    |
| ~~Transaction receipts (PDF download)~~ | ~~PDF receipt + account statement endpoints~~      | ✅ Done     | —         |

## 🖥️ Frontend Gaps (React app exists — these pages are missing)

- [ ] 2FA setup UI (QR code + backup codes screens)
- [ ] Profile / settings page (change password, set PIN, view KYC status)
- [ ] Forgot / reset password screens
- [ ] CSV / PDF export buttons on the transactions page
- [ ] Admin dashboard UI (KYC approvals, user management, transaction stats)

## 🛠️ Engineering / Ops

- [ ] **Automated tests** – no test suite exists yet (backend or frontend)
- [ ] **Deployment** – no Dockerfile, CI workflow, or render.yaml found
- [ ] **README files** – `backend-node/README.md` and `frontend/README.md` are empty
- [ ] **Cleanup** – delete `prisma/schema copy.prisma` and `src/services/email.service copy.ts`

---

Recommended order: **Session management** → **Login alerts** → **Frontend 2FA/profile pages** → **Tests**.

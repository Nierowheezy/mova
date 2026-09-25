# 04 — Authentication & security

> Plain-language goal: explain how a user gets logged in, stays logged in,
> protects their account (2FA + PIN), and what the server does to make attacks
> hard.

## 1. Credentials at rest

- Passwords and transaction PINs are hashed with **bcrypt** (never stored or
  logged in plaintext).
- The admin middlewares and the auth service enforce **password history** —
  users can't reuse very recent passwords.
- **KYC PII** (`fullName`, etc.) is **encrypted at rest** via a Prisma
  `$use` middleware (`src/config/database.ts`) using `ENCRYPTION_KEY`
  (AES-256-GCM, see `src/shared/utils/encryption.ts`).

## 2. Sessions: short access token + rotating refresh token

- **Access token:** JWT, `15m` expiry, sent as `Authorization: Bearer …`.
  Short-lived so a leaked token expires fast.
- **Refresh token:** long-lived (`14d`), stored **httpOnly + Secure cookie**
  (see `src/shared/utils/cookieHelpers.ts`), and **rotated on every use**.
  Rotation lives on `refresh_tokens` rows grouped by **`family`**: if someone
  replays a used refresh token, the whole family is revoked (reuse detection)
  — this is the standard mitigation against stolen refresh tokens.
- Logout flow invalidates the current family server-side.

## 3. 2FA (TOTP)

- Enabled per-user with **speakeasy** (RFC-6238 authenticator codes).
- Login flow: password → if 2FA on, a TOTP code is required (and backed up by
  hashed **backup codes** generated once, shown plaintext exactly one time).

## 4. Brute-force protection

| Surface | Defense | File |
| --- | --- | --- |
| Global API | 100 req / 15 min per user-or-IP | `rateLimiter.ts` |
| Login / auth endpoints | 5 attempts / 15 min per `ip+email`, success resets | `rateLimiter.ts` (authLimiter) |
| Transaction endpoints | 10 req / 5 min per user | `rateLimiter.ts` (transactionLimiter) |
| Transaction PIN | 5 wrong → PIN locked 15 min (`pinFailedAttempts`, `pinLockedUntil`), success resets | `transfer.service.ts` |
| Login attempts DB trail | `login_attempts` rows for audit/analysis | auth service |

## 5. Transport & headers

- **helmet** at the top of the stack (HSTS, nosniff, frame denial, …).
- **CORS** locked to `CLIENT_URL` with credentials.
- **Cookies**: `httpOnly`, `Secure`, `SameSite` configured in `cookieHelpers`.
- Webhook endpoints use **raw-body signature verification** (see
  [11-webhooks-stripe.md](./11-webhooks-stripe.md)).

## 6. Authorization (roles)

- `USER` / `SUPPORT` / `ADMIN`, enforced by `admin.middleware.requireAdmin`.
- Admin surface is separate (`/api/v1/admin/…`) and every sensitive admin
  action (KYC approve, freeze, tier change, AML review) writes an
  **`audit_logs`** row: who, what, target, IP, user-agent, timestamp.

## 7. Known hardening steps (Phase 6 — not yet done)

Documented in the remediation plan; high-signal items:

- **CSRF protection** for the cookie-based refresh flow (double-submit or a
  dedicated CSRF token) once `SameSite` behaves, because cross-site requests
  should not be able to ride the refresh cookie.
- **PII redaction audit** in the logger middleware (never log emails, PINs,
  secrets, or KYC documents in any path).
- **Decimal/string serialization consistency** across API responses (money is
  serialized as Decimal strings by Prisma — keep it uniform, don't `Number()`
  in controllers).
- Consider **argon2id** over bcrypt and **audit device/passkeys** for admin.

Next: the money model → [05-wallet-and-ledger.md](./05-wallet-and-ledger.md)
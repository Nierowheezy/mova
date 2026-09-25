# Changelog

All notable changes to Mova are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Placeholder for the next release.

## [1.0.0] - 2026-09-25

Initial production release. Deployed live on Render: frontend SPA, backend API,
managed PostgreSQL, and CI/CD from this repository.

### Added

- Full-stack monorepo: React 19 SPA (Vite + TypeScript + Tailwind) and an
  Express + Prisma + PostgreSQL banking API.
- Auth: registration with email verification (Resend), login, JWT access tokens
  (15 min), rotating refresh tokens via HTTP-only cookie (14 days), optional
  TOTP two-factor authentication, password history (no reuse), and login
  attempt tracking.
- Wallet & money movement: balances, peer-to-peer transfers, Stripe deposits,
  Stripe Connect withdrawals, savings goals, beneficiaries, transactions,
  and notifications.
- Fintech guarantees: row-locked (SELECT FOR UPDATE) ACID transfers, double-entry
  ledger (ledger_accounts / ledger_entries), idempotent deposits and withdrawals,
  and webhook-authoritative deposits (wallet credited by Stripe
  payment_intent.succeeded).
- Compliance: KYC verification with document upload and admin approval, KYC
  tiers (BASIC / VERIFIED / PREMIUM) that scale fraud limits, and an AML rules
  engine flagging suspicious activity for ops review.
- API docs: OpenAPI 3 (Swagger UI) covering every endpoint with schemas.
- Ops: SENTRY support, metrics endpoint, rate limiting, role-based access
  control, and encryption of sensitive fields.
- CI/CD: GitHub Actions workflows (CI, Render deploy, optional Vercel deploy,
  nightly auth reconcile) and a render.yaml Blueprint.
- Docs: detailed README with live screenshots and a DEPLOY.md runbook.

### Fixed

- Production cookie SameSite=None so session refresh works across the
  cross-site frontend/API origins.
- Swagger servers list: production API URL now appears (and is selected by
  default) when NODE_ENV=production.

### Changed

- Login and signup pages redesigned to match the Mova prototypes
  (split-screen brand panel + form panel, theme toggle).
- Frontend now ships the Mova favicon and brand title.
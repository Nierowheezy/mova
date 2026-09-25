import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Fintech Banking API",
      version: "2.0.0",
      description: `
API documentation for the fintech wallet backend: transfers, deposits,
withdrawals, savings goals, KYC verification, AML monitoring, admin ops, and
Stripe webhooks.

Fintech guarantees implemented:
- **ACID money movement** — row-locked (\`SELECT … FOR UPDATE\`) Postgres
  transactions with in-transaction balance checks (no double-spend).
- **Double-entry ledger** — every movement posts a DEBIT + CREDIT pair to an
  append-only ledger (\`ledger_accounts\` / \`ledger_entries\`).
- **Idempotency** — deposit & withdrawal require a client \`idempotencyKey\`
  (uuid); transfers accept one. Replays return the original response.
- **Webhook-authoritative deposits** — \`POST /deposit\` only records a
  PENDING transaction; the wallet is credited by the Stripe
  \`payment_intent.succeeded\` webhook (amount-verified, deduplicated).
- **KYC tiers & fraud limits** — per-transaction + rolling-24h limits scale
  with KYC tier (BASIC / VERIFIED / PREMIUM).
- **AML monitoring** — a rules engine flags suspicious activity for ops review.
`,
    },
    servers: [
      { url: "http://localhost:8000/api/v1", description: "Local development" },
    ],
    tags: [
      { name: "Auth", description: "Registration, login, 2FA, refresh tokens" },
      { name: "Wallet", description: "Wallet balances & lookups" },
      { name: "Transfer", description: "Peer-to-peer wallet transfers" },
      { name: "Deposit", description: "Funding the wallet via Stripe" },
      { name: "Withdraw", description: "Cash out to a bank account (Stripe Connect)" },
      { name: "Savings", description: "Savings goals" },
      { name: "KYC", description: "Know-Your-Customer verification & documents" },
      { name: "Admin", description: "Ops: users, KYC, transactions, AML queue" },
      { name: "Webhook", description: "Stripe event processing (raw body)" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        AccountTier: {
          type: "string",
          enum: ["BASIC", "VERIFIED", "PREMIUM"],
          description:
            "KYC/account tier. Drives fraud-control limits in src/config/limits.ts",
        },
        IdempotencyKey: {
          type: "string",
          format: "uuid",
          description:
            "Client-generated uuid — REQUIRED for deposit & withdrawal. Replays return the original response and never double-charge.",
        },
        AmlFlag: {
          type: "object",
          properties: {
            id: { type: "integer" },
            rule: {
              type: "string",
              enum: [
                "LARGE_SINGLE_TX",
                "VELOCITY_24H",
                "STRUCTURING_24H",
                "NEW_ACCOUNT_MOVES",
                "ROUND_AMOUNT",
              ],
            },
            severity: {
              type: "string",
              enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            },
            status: {
              type: "string",
              enum: ["OPEN", "UNDER_REVIEW", "DISMISSED", "ESCALATED"],
            },
            details: { type: "object" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        ErrorEnvelope: {
          type: "object",
          properties: {
            success: { type: "boolean", enum: [false] },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: { type: "array", items: { type: "object" } },
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./src/modules/**/*.ts", "./src/modules/**/*.js"], // Adjust paths
};

export const specs = swaggerJsdoc(options);
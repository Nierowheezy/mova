# 14 — DTOs, validation & error contracts

> Plain-language goal: every request is type-checked at the door (DTOs), every
> failure comes back in the same envelope with a machine-readable code, so the
> frontend can handle errors uniformly and garbage never reaches business
> logic.

## 1. DTOs (Data Transfer Objects)

Each module has a `dto/` folder with a **zod schema** describing exactly what
the route accepts, e.g. `transfer/dto/transfer.dto.ts`:

```ts
export const TransferSchema = z.object({
  body: z.object({
    walletId: z.string().min(10),
    amount:   z.number().positive("Amount must be greater than 0"),
    transactionPin: z.string().min(4),
    saveBeneficiary: z.boolean().optional().default(false),
    idempotencyKey: z.string().uuid(...).optional(),
  }),
});
export type TransferDto = z.infer<typeof TransferSchema>["body"];  // shared type
```

- The schema doubles as the **TypeScript type** (`z.infer`) consumed by the
  service, so request → validation → service compile against one contract.
- `validate(schema)` middleware (`shared/middleware/validation.middleware.ts`)
  parses `{ body, query, params }` per request and short-circuits with
  `400 VALIDATION_ERROR` + details on any mismatch.

## 2. Error envelope (one shape for everything)

Every error handler and controller failure returns the same shape
(`shared/middleware/errorHandler.ts`, `shared/utils/AppError.ts`):

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Insufficient funds",
    "details": []            // optional (e.g. zod issues)
  }
}
```

`AppError(code, message, httpStatus)` is thrown by services with stable,
documented codes:

| Code | Meaning |
| --- | --- |
| `VALIDATION_ERROR` | DTO/body failed zod validation |
| `UNAUTHORIZED` | No/expired token |
| `INSUFFICIENT_FUNDS` | Balance check failed on the locked row |
| `SELF_TRANSFER` | Sending to your own wallet |
| `KYC_NOT_VERIFIED` | Transfers require VERIFIED KYC |
| `PIN_LOCKED` / `INVALID_PIN` | Transaction PIN lockout / wrong PIN |
| `TX_LIMIT_EXCEEDED` / `DAILY_LIMIT_EXCEEDED` | Tier-based fraud limits |
| `OPERATION_FAILED_PREVIOUSLY` | Replaying an idempotency key of a failed op |
| `PAYMENT_FAILED` / `WITHDRAWAL_FAILED` | Stripe-stage failures |
| `ACCOUNT_FROZEN` / `RECEIVER_FROZEN` | Freeze states |
| `GOAL_NOT_REACHED` / `NOTHING_TO_WITHDRAW` | Savings rules |
| `STRIPE_CONNECT_NOT_ONBOARDED` | Withdraw before Connect onboarding |

**Never** leak stack traces: internal errors log the stack server-side and
return a generic `500` envelope.

## 3. Success envelope

```json
{ "success": true, "data": { ... }, "meta": { total, page, limit, pages } }
```

`meta` appears on paginated admin endpoints. Controllers shape responses;
services return domain data.

## 4. Why DTOs (senior-engineer view)

- **Fail fast**: validation happens before auth-heavy/business-heavy work.
- **Contract as code**: the API spec (swagger) and the runtime checks can't
  drift from the TypeScript types.
- **Injection resistant**: body shape is pinned; you stop trusting raw
  `req.body` everywhere.

## 5. Known gaps

- Some older controllers still read `req.body` directly (e.g.
  `admin/controllers/kyc.controller.ts reject` reads `reason` untyped).
  Backfill them onto DTOs as they're touched.
- Rate-limit "too many requests" messages use the same envelope but are
  emitted by the limiter itself.

Next: testing → [15-testing.md](./15-testing.md)
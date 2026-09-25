# 12 — Uploads & file storage (KYC documents)

> Plain-language goal: how uploaded IDs are stored without leaking them to the
> world, and what to change for production.

## 1. The problem this solved

The original app served everything under `uploads/` via
`express.static(UPLOAD_DIR)` — meaning anyone with the URL could fetch
someone's passport photo. That's a PII leak and a compliance failure. The fix:

1. **Static serving removed** from `app.ts`.
2. Uploads now return an **opaque `fileId`** (the stored filename), never a
   public URL.
3. Downloading is an **authenticated, authorization-checked** endpoint.

## 2. Upload path

`POST /api/v1/upload` (auth required) → `multer` writes to `UPLOAD_DIR`
(images only: JPG/PNG, ≤ `MAX_FILE_SIZE`) → responds:

```
{ success: true, data: { fileId, originalName, size, mimeType } }
```

Frontend passes `fileId` as `idImage` when creating the KYC record.

## 3. Download path (access controlled)

`GET /api/v1/kyc/documents/:fileName` (auth required):

1. Rejects anything that isn't a bare filename (`path.basename` guard — no
   `../` traversal, which would read arbitrary server files).
2. `KYCService.canAccessDocument` — allowed only for the **document owner** or
   **ADMIN/SUPPORT** roles.
3. Resolves a private path under `UPLOAD_DIR`, serves `inline` with
   `Cache-Control: private, no-store`.

## 4. Storage choices & roadmap

| Option | Status |
| --- | --- |
| Local private disk (current) | Works for a single instance + dev; files are not replicated and not S3-compatible |
| Object storage (R2 / S3) + signed URLs | **Production target.** Store the object key; generate short-lived signed URLs for download; keep the same permission model in middleware before handing out a URL |

Design note: even with S3, never return a bare public URL — either sign it
with an expiry or proxy through the authenticated endpoint.

## 5. Risks to track

- Disk fills up → add retention/cleanup jobs (delete rejected/replaced KYC
  files) and size caps per user.
- Because files are PII, the **encryption-at-rest story** applies to object
  storage too (R2 is encrypted at rest by default; S3 needs SSE).
- Multi-instance deployments MUST use shared/object storage — local disks on
  replica N aren't reachable from replica M (see 17-scaling).

Next: idempotency → [13-idempotency.md](./13-idempotency.md)
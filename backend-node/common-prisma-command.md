The errors indicate that Prisma Client hasn't been regenerated after adding the new `emailVerified` field and `VerificationToken` model.

## Fix: Regenerate Prisma Client and run migration

### 1. Run Prisma generate

```bash
npx prisma generate
```

### 2. Run migration (if not already done)

```bash
npx prisma migrate dev --name add_email_verification_and_tokens
```

### 3. Restart TypeScript server (VS Code)

- `Cmd+Shift+P` → "TypeScript: Restart TS server"

### 4. Restart your Node server

```bash
npm run dev
```

After these steps, the TypeScript errors should disappear because Prisma Client will include the new `emailVerified` field on the `User` type and the `verificationToken` model.

If the error persists, ensure your `schema.prisma` has the correct model name (singular) and that you've imported the correct Prisma client after generation.

**Also check your `auth.service.ts` import – ensure you're using the regenerated client (no local caching).**

Let me know if the errors are resolved after running these commands.

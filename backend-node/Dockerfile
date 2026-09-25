# ─── Stage 1: dependencies + TypeScript build ──────────────────────────────
FROM node:22-alpine AS builder

# pnpm via corepack (managed by packageManager in package.json / pnpm-workspace.yaml)
RUN corepack enable

WORKDIR /app

# Prisma's query engine needs openssl at build AND runtime on alpine
RUN apk add --no-cache openssl

# Install deps first (layer-cached: source changes don't re-run install)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source + prisma schema, generate the client, compile
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN pnpm prisma:generate
RUN pnpm build

# ─── Stage 2: slim production runtime ───────────────────────────────────────
FROM node:22-alpine AS runtime

RUN corepack enable \
  && apk add --no-cache openssl \
  && addgroup -S app && adduser -S app -G app

WORKDIR /app
ENV NODE_ENV=production

# Only what the server needs at runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Writable uploads volume for private KYC documents
RUN mkdir -p /app/uploads && chown -R app:app /app
USER app

EXPOSE 8000
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
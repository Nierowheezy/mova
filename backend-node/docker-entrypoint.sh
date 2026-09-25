#!/bin/sh
set -e

echo "[entrypoint] Waiting for PostgreSQL to accept connections..."

# Tiny TCP probe — no extra CLI tools needed, works in the slim alpine image.
node -e '
const net = require("net");
const url = new URL(process.env.DATABASE_URL || "");
const host = url.hostname || "localhost";
const port = Number(url.port || 5432);
let attempts = 0;
const tryOnce = () => {
  const socket = net.connect(port, host);
  socket.on("connect", () => { console.log("[entrypoint] Database reachable ✅"); socket.end(); process.exit(0); });
  socket.on("error", () => socket.destroy());
};
const timer = setInterval(() => {
  if (++attempts > 90) { console.error("[entrypoint] Database not reachable after 90s — aborting."); process.exit(1); }
  tryOnce();
}, 1000);
tryOnce();
'

echo "[entrypoint] Applying pending migrations (prisma migrate deploy)..."
npx prisma migrate deploy

echo "[entrypoint] Starting API server..."
exec node dist/server.js
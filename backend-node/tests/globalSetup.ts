import { spawnSync } from "child_process";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:admin1234@localhost:5433/fintech_test";

export default function globalSetup() {
  // Give every run a clean schema.
  const result = spawnSync(
    "pnpm",
    ["exec", "prisma", "migrate", "reset", "--force", "--skip-seed"],
    {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error("prisma migrate reset failed for the test database");
  }
}
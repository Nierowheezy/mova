/**
 * Nightly reconciliation — the single most valuable fintech monitor.
 *
 * Proves the double-entry invariant across the WHOLE database:
 *   1. wallets.balance                == ledger_accounts("wallet:<id>").balance
 *   2. savings_goals.currentAmount    == ledger_accounts("goal:<uuid>").balance
 *   3. platform house account         == -(sum of every customer balance)  (cents)
 *
 * If any of those drift, money moved in a way the ledger didn't record — the
 * exact class of bug that silently eats user funds. Alert on non-zero exit.
 *
 * Usage:
 *   pnpm db:reconcile                # human-readable report
 *   pnpm db:reconcile -- --json      # machine-readable for your alert tooling
 *
 * Alerting: when drift is found AND an alert webhook is configured, the job
 * POSTs the JSON report to it before exiting 1. Configure via:
 *   ALERT_WEBHOOK_URL=<slack/generic webhook> pnpm db:reconcile
 * or pass `--alert-url <url>`. Works with the nightly GitHub workflow
 * (`.github/workflows/reconcile-nightly.yml`) or any cron.
 *
 * Exit codes: 0 = clean · 1 = drift found · 2 = runtime error (unreachable DB).
 * Run nightly (cron / GitHub Actions schedule / Render cron job).
 */
import { PrismaClient } from "@prisma/client";
import {
  walletAccountId,
  goalAccountId,
} from "../src/services/ledger.service";

const prisma = new PrismaClient();
const isJson = process.argv.includes("--json");
const alertUrl =
  process.argv[process.argv.indexOf("--alert-url") + 1] ??
  process.env.ALERT_WEBHOOK_URL ??
  "";

async function sendAlert(payload: unknown): Promise<void> {
  if (!alertUrl) return;
  try {
    const res = await fetch(alertUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`Alert webhook returned ${res.status}`);
    } else {
      console.log("🚨 Drift alert delivered to webhook");
    }
  } catch (err: any) {
    // A failed alert must not mask the underlying drift exit code.
    console.error("Alert delivery failed:", err?.message ?? err);
  }
}

type Drift = {
  type: "wallet" | "goal" | "platform";
  id: string;
  expected: string; // dollars, 2 decimals
  actual: string; // dollars, 2 decimals
  detail: string;
};

function cents(n: number): number {
  return Math.round(n * 100);
}

function fmt(n: number): string {
  return n.toFixed(2);
}

async function main() {
  const drifts: Drift[] = [];

  // 1. Wallets
  const wallets = await prisma.wallet.findMany({ select: { id: true, balance: true } });
  for (const w of wallets) {
    const account = await prisma.ledgerAccount.findUnique({
      where: { accountId: walletAccountId(w.id) },
    });
    const expected = Number(w.balance);
    const actual = account ? Number(account.balance) : 0;
    if (!account) {
      drifts.push({
        type: "wallet",
        id: String(w.id),
        expected: fmt(expected),
        actual: "0",
        detail: `missing ledger account (run pnpm db:backfill:ledger)`,
      });
    } else if (cents(actual) !== cents(expected)) {
      drifts.push({
        type: "wallet",
        id: String(w.id),
        expected: fmt(expected),
        actual: fmt(actual),
        detail: "wallet.balance != ledger balance",
      });
    }
  }

  // 2. Savings goals
  const goals = await prisma.savingsGoal.findMany({
    select: { uuid: true, currentAmount: true, name: true },
  });
  for (const g of goals) {
    const account = await prisma.ledgerAccount.findUnique({
      where: { accountId: goalAccountId(g.uuid) },
    });
    const expected = Number(g.currentAmount);
    const actual = account ? Number(account.balance) : 0;
    if (!account) {
      drifts.push({
        type: "goal",
        id: g.uuid,
        expected: fmt(expected),
        actual: "0",
        detail: `missing ledger account for goal "${g.name}" (run pnpm db:backfill:ledger)`,
      });
    } else if (cents(actual) !== cents(expected)) {
      drifts.push({
        type: "goal",
        id: g.uuid,
        expected: fmt(expected),
        actual: fmt(actual),
        detail: `currentAmount != ledger balance for goal "${g.name}"`,
      });
    }
  }

  // 3. Platform house account mirrors customer funds (settlement side).
  //    The platform account is created lazily on the first external movement
  //    (deposit/withdrawal), so on a fresh/empty database it legitimately
  //    doesn't exist yet — that's NOT a drift unless customer funds exist.
  const platform = await prisma.ledgerAccount.findUnique({
    where: { accountId: "platform" },
  });
  const customerCents = [
    ...wallets.map((w) => cents(Number(w.balance))),
    ...goals.map((g) => cents(Number(g.currentAmount))),
  ].reduce((a, b) => a + b, 0);
  if (customerCents === 0) {
    // No customer funds → platform should be zero. Missing = fine (lazy init).
    if (platform && cents(Number(platform.balance)) !== 0) {
      drifts.push({
        type: "platform",
        id: "platform",
        expected: "0.00",
        actual: fmt(Number(platform.balance)),
        detail: "platform balance is non-zero while no customer funds exist",
      });
    }
  } else {
    const platformExpectedCents = -customerCents;
    const platformActualCents = platform ? cents(Number(platform.balance)) : 0;
    if (!platform) {
      drifts.push({
        type: "platform",
        id: "platform",
        expected: fmt(platformExpectedCents / 100),
        actual: "0",
        detail: "missing platform house account (run pnpm db:backfill:ledger)",
      });
    } else if (platformActualCents !== platformExpectedCents) {
      drifts.push({
        type: "platform",
        id: "platform",
        expected: fmt(platformExpectedCents / 100),
        actual: fmt(platformActualCents / 100),
        detail: "platform account does not mirror total customer funds",
      });
    }
  }

  const summary = {
    wallets: wallets.length,
    goals: goals.length,
    driftCount: drifts.length,
    clean: drifts.length === 0,
  };

  if (isJson) {
    console.log(JSON.stringify({ ...summary, drifts }, null, 2));
  } else {
    if (drifts.length === 0) {
      console.log(
        `✅ Reconciliation clean — ${wallets.length} wallet(s), ${goals.length} goal(s), platform in balance.`,
      );
    } else {
      console.log(
        `❌ ${drifts.length} drift(s) found — money moved without hitting the ledger:`,
      );
      for (const d of drifts) {
        console.log(
          `  [${d.type}] ${d.id}: expected ${d.expected} got ${d.actual} — ${d.detail}`,
        );
      }
    }
  }

  process.exitCode = drifts.length === 0 ? 0 : 1;

  if (!isJson && drifts.length > 0 && alertUrl) {
    console.log(`📣 Notifying alert webhook: ${alertUrl}`);
  }

  if (drifts.length > 0) {
    await sendAlert({ ...summary, drifts, generatedAt: new Date().toISOString() });
  }
}

main()
  .catch(async (error) => {
    console.error("Reconciliation failed:", error);
    process.exitCode = 2;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
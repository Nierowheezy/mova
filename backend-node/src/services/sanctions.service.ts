import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../shared/utils/logger";

/**
 * ─── Sanctions / PEP screening — real, and BLOCKING ──────────────────────
 *
 * A fintech must screen every customer against OFAC-SDN / EU / UN sanction
 * lists and PEP databases BEFORE onboarding (at KYC approval), and deny
 * service when the screen does not clear. This module is the enforcement
 * point — it is no longer a "always clears" stub.
 *
 * Provider config (`SANCTIONS_PROVIDER`):
 *
 *   "sandbox"        → dev/test convenience: always clears EXCEPT in
 *                      production, where it FAILS CLOSED (approval is denied
 *                      until a real provider is configured). This is
 *                      deliberate: you cannot safely launch with the stub.
 *
 *   "opensanctions"  → screen against local OpenSanctions CSV exports
 *                      (free, OFAC/UN/EU consolidated). Expects, inside
 *                      SANCTIONS_DATA_DIR (default ./data/sanctions):
 *                         sanctions.csv   → sanctions/embargo targets
 *                         peps.csv        → politically exposed persons
 *                      See data/sanctions/README.md for how to download them.
 *                      If NO dataset file is present the screen FAILS CLOSED
 *                      (cannot prove clean ⇒ deny) — never fail-open.
 *
 * Fail-closed principle: an unavailable screen is a denial, never a pass.
 */

export interface SanctionsScreeningResult {
  cleared: boolean;
  provider: string;
  /** Matched list entries, when any. Empty + cleared when clean. */
  matches: Array<{ list: string; name: string; reason?: string }>;
  screenedAt: Date;
}

export interface ScreenablePerson {
  id: number;
  fullName: string;
  dateOfBirth?: Date | null;
  email?: string | null;
  /** ISO 3166-1 alpha-2 country of residence, when collected (KYC doesn't yet). */
  country?: string | null;
}

export interface SanctionsRecord {
  list: string; // e.g. "sanctions" | "peps"
  name: string;
  /** YYYY-MM-DD or YYYY. */
  dob?: string | null;
  /** ISO2 code or name. */
  country?: string | null;
}

const SUPPORTED_LISTS = ["sanctions", "peps"] as const;

// ─────────────────────────────────────────────────────────────────────────
// Name normalization & matching (pure functions — unit-tested)
// ─────────────────────────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  // Accent-fold FIRST (NFD decomposes "Á" → "A"+combining mark, then
  // \p{Diacritic} removes the mark) so "José" ≈ "Jose", "CAFÉ" ≈ "cafe".
  // Non-Latin scripts (Cyrillic, Arabic…) have no diacritic marks and are
  // simply dropped here — a commercial provider adds transliteration.
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function nameTokens(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Fraction of the SMALLER token set that also appears in the larger one.
 * 1.0 means every token of the shorter name matched — good enough to catch
 * "DOE, JOHN" vs "John Doe" and "John Michael Doe" vs "John Doe" without a
 * false-positive-prone substring test.
 */
export function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  const largeSet = new Set(large);
  const hits = small.filter((t) => largeSet.has(t)).length;
  return hits / small.length;
}

/** Minimal RFC-4180 CSV line parser — handles quoted names like "DOE, JOHN". */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** DOB year match — records often only carry a year; compare years only. */
export function dobYearMatches(
  recordDob: string | null | undefined,
  personDob?: Date | null,
): boolean {
  if (!recordDob) return true; // no DOB on record = no filter
  if (!personDob) return true; // no DOB provided = cannot disprove
  const recordYear = String(recordDob).slice(0, 4);
  const personYear = String(personDob.getFullYear());
  // "absent" record year (e.g. "00xx" placeholders) should not false-block.
  return !/^\d{4}$/.test(recordYear) || recordYear === personYear;
}

export function matchSanctionRecord(
  record: SanctionsRecord,
  person: ScreenablePerson,
): { matched: boolean; reason: string } {
  const pTokens = nameTokens(person.fullName);
  if (pTokens.length === 0) return { matched: false, reason: "no name to screen" };
  const rTokens = nameTokens(record.name);
  if (rTokens.length === 0) return { matched: false, reason: "empty list entry" };

  const overlap = tokenOverlap(rTokens, pTokens);
  let matched = overlap >= 1; // every token of the shorter name must appear
  let reason = `name overlap ${Math.round(overlap * 100)}%`;

  if (matched) {
    const dobOk = dobYearMatches(record.dob, person.dateOfBirth);
    matched = dobOk;
    reason += dobOk ? " · DOB year consistent" : " · DOB year differs";
  }
  if (matched && record.country && person.country) {
    if (record.country.toUpperCase() !== person.country.toUpperCase()) {
      matched = false;
      reason += " · country excludes";
    }
  }
  return { matched, reason };
}

export function screenRecords(
  records: SanctionsRecord[],
  person: ScreenablePerson,
): Array<{ list: string; name: string; reason: string }> {
  const out: Array<{ list: string; name: string; reason: string }> = [];
  for (const record of records) {
    const { matched, reason } = matchSanctionRecord(record, person);
    if (matched) out.push({ list: record.list, name: record.name, reason });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// CSV dataset loading
// ─────────────────────────────────────────────────────────────────────────

async function readCsvRecords(
  file: string,
  list: string,
): Promise<SanctionsRecord[] | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return null; // file absent
    logger.error({ err: err.message, file }, "sanctions dataset read failed");
    return null;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (...names: string[]) =>
    header.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const iName = idx("name", "caption", "title");
  const iDob = idx("birth_date", "date_of_birth", "dob", "birthdate");
  const iCountry = idx("countries", "country", "nationality");
  if (iName < 0) return [];

  const records: SanctionsRecord[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const name = cols[iName];
    if (!name) continue;
    records.push({
      list,
      name,
      dob: iDob >= 0 ? cols[iDob] || null : null,
      country: iCountry >= 0 ? cols[iCountry] || null : null,
    });
  }
  return records;
}

// ─────────────────────────────────────────────────────────────────────────
// Public screening entry point — BLOCKING (`cleared:false` must stop the
// flow: KYC approval is denied + a CRITICAL AML flag is raised).
// ─────────────────────────────────────────────────────────────────────────

export async function screenAgainstSanctions(
  person: ScreenablePerson,
): Promise<SanctionsScreeningResult> {
  // Read config at call time (not module scope) so tests can switch providers.
  const provider = (process.env.SANCTIONS_PROVIDER ?? "sandbox").toLowerCase();
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";
  const screenedAt = new Date();

  if (provider === "opensanctions") {
    const dataDir = process.env.SANCTIONS_DATA_DIR ?? "./data/sanctions";
    let records: SanctionsRecord[] = [];
    let anyDatasetLoaded = false;
    for (const list of SUPPORTED_LISTS) {
      const res = await readCsvRecords(join(dataDir, `${list}.csv`), list);
      if (res) {
        anyDatasetLoaded = true;
        records = records.concat(res);
      }
    }

    if (!anyDatasetLoaded) {
      // Fail CLOSED: we cannot prove the person is clean, so we treat the
      // screen as not cleared and escalate to ops.
      const result: SanctionsScreeningResult = {
        cleared: false,
        provider: `${provider}-no-dataset`,
        matches: [
          {
            list: "SYSTEM",
            name: person.fullName,
            reason: `no sanctions dataset found in ${dataDir} — cannot prove clear, treating as blocked`,
          },
        ],
        screenedAt,
      };
      logger.error(
        { userId: person.id, dataDir },
        "SANCTIONS SCREEN FAILED CLOSED — no dataset loaded",
      );
      return result;
    }

    const matches = screenRecords(records, person);
    const result: SanctionsScreeningResult = {
      cleared: matches.length === 0,
      provider: "opensanctions",
      matches,
      screenedAt,
    };
    logger.info(
      {
        userId: person.id,
        name: person.fullName,
        recordsChecked: records.length,
        matches: matches.length,
        cleared: result.cleared,
      },
      result.cleared
        ? "Sanctions screening cleared"
        : "SANCTIONS SCREENING MATCHED — approval must be blocked",
    );
    return result;
  }

  // ── sandbox provider ────────────────────────────────────────────────────
  if (isProduction) {
    // FAIL CLOSED: shipping the stub into production silently would be a
    // compliance incident. Refuse to clear until a real provider is set.
    const result: SanctionsScreeningResult = {
      cleared: false,
      provider: "sandbox-fail-closed",
      matches: [
        {
          list: "SYSTEM",
          name: person.fullName,
          reason:
            "SANCTIONS_PROVIDER=sandbox in production — defaulting to deny. Configure SANCTIONS_PROVIDER=opensanctions with a dataset.",
        },
      ],
      screenedAt,
    };
    logger.error(
      { userId: person.id },
      "SANCTIONS FAILED CLOSED — sandbox provider in production is not allowed",
    );
    return result;
  }

  // Dev/test: permissive placeholder so local flows work without data.
  const result: SanctionsScreeningResult = {
    cleared: true,
    provider: "sandbox",
    matches: [],
    screenedAt,
  };
  logger.info(
    { userId: person.id, fullName: person.fullName, provider: "sandbox" },
    "Sanctions screening cleared (sandbox provider)",
  );
  return result;
}
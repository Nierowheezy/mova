import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  screenAgainstSanctions,
  normalizeName,
  nameTokens,
  tokenOverlap,
  parseCsvLine,
  dobYearMatches,
  matchSanctionRecord,
  screenRecords,
  SanctionsRecord,
} from "../src/services/sanctions.service";
import { AdminKYCService } from "../src/modules/admin/services/kyc.service";
import { prisma } from "../src/config/database";
import { createUser, resetDatabase } from "./helpers";

const kycService = new AdminKYCService();

// Snapshot process.env so provider switches never leak into other suites.
const originalEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of [
    "SANCTIONS_PROVIDER",
    "SANCTIONS_DATA_DIR",
    "NODE_ENV",
    "ALERT_WEBHOOK_URL",
  ]) {
    originalEnv[k] = process.env[k];
  }
  return resetDatabase();
});
afterAll(() => {
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return prisma.$disconnect();
});

async function makeFixtureDir(rows: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sanctions-test-"));
  // Matches the OpenSanctions simple export shape.
  await writeFile(
    join(dir, "sanctions.csv"),
    `id,name,birth_date,countries\n${rows.join("\n")}\n`,
  );
  return dir;
}

describe("name normalization & token matching", () => {
  it("normalizeName strips punctuation, case and spacing", () => {
    expect(normalizeName("Doe, JOHN ÁCCENT")).toBe("doejohnaccent");
    expect(normalizeName("José María")).toBe("josemaria"); // accent folding
    // Non-Latin scripts carry no diacritics → dropped (documented limitation;
    // a real API provider adds transliteration).
    expect(normalizeName("Ali-Хussein al-Sa'id")).toBe("aliusseinalsaid");
  });

  it("parseCsvLine handles quoted commas (names like 'DOE, JOHN')", () => {
    expect(parseCsvLine(`x1,"Doe, JOHN",1990`)).toEqual(["x1", "Doe, JOHN", "1990"]);
  });

  it("name overlap is symmetric and order-independent", () => {
    expect(tokenOverlap(nameTokens("John Doe"), nameTokens("Doe, John"))).toBe(1);
    expect(tokenOverlap(nameTokens("John Michael Doe"), nameTokens("John Doe"))).toBe(1);
    expect(tokenOverlap(nameTokens("Jane Doe"), nameTokens("John Doe"))).toBe(0.5);
  });

  it("dobYearMatches compares years only and tolerates absent data", () => {
    expect(dobYearMatches("1990-01-01", new Date("1990-06-01"))).toBe(true);
    expect(dobYearMatches("1990-01-01", new Date("1991-06-01"))).toBe(false);
    expect(dobYearMatches(null, undefined)).toBe(true);
    expect(dobYearMatches("1990-01-01", null)).toBe(true); // unknown DOB can't disprove
  });

  it("matchSanctionRecord respects DOB year and country filters", () => {
    const record: SanctionsRecord = {
      list: "sanctions",
      name: "Doe, John",
      dob: "1990-01-01",
      country: "US",
    };
    expect(
      matchSanctionRecord(record, {
        id: 1,
        fullName: "John Doe",
        dateOfBirth: new Date("1990-03-15"),
      }).matched,
    ).toBe(true);
    expect(
      matchSanctionRecord(record, {
        id: 2,
        fullName: "John Doe",
        dateOfBirth: new Date("1975-03-15"),
      }).matched,
    ).toBe(false); // same name, wrong DOB → not the same person
  });
});

describe("screenAgainstSanctions — provider behavior", () => {
  beforeEach(() => {
    process.env.SANCTIONS_PROVIDER = "";
    process.env.SANCTIONS_DATA_DIR = "";
    process.env.NODE_ENV = "test";
  });

  it("sandbox provider clears in dev/test", async () => {
    process.env.SANCTIONS_PROVIDER = "sandbox";
    const r = await screenAgainstSanctions({ id: 1, fullName: "Jane Doe" });
    expect(r.cleared).toBe(true);
    expect(r.provider).toBe("sandbox");
  });

  it("sandbox provider FAILS CLOSED in production", async () => {
    process.env.SANCTIONS_PROVIDER = "sandbox";
    process.env.NODE_ENV = "production";
    const r = await screenAgainstSanctions({ id: 1, fullName: "Jane Doe" });
    expect(r.cleared).toBe(false);
    expect(r.matches[0].list).toBe("SYSTEM");
  });

  it("opensanctions BLOCKS on a name match ('Doe, John' ≈ John Doe)", async () => {
    const dir = await makeFixtureDir([`x1,"Doe, John",1990-01-01,US`]);
    process.env.SANCTIONS_PROVIDER = "opensanctions";
    process.env.SANCTIONS_DATA_DIR = dir;
    const r = await screenAgainstSanctions({
      id: 1,
      fullName: "John Doe",
      dateOfBirth: new Date("1990-05-05"),
    });
    await rm(dir, { recursive: true, force: true });
    expect(r.cleared).toBe(false);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].list).toBe("sanctions");
  });

  it("opensanctions clears when no record matches", async () => {
    const dir = await makeFixtureDir([`x2,"Alice Smith",1985-05-05,GB`]);
    process.env.SANCTIONS_PROVIDER = "opensanctions";
    process.env.SANCTIONS_DATA_DIR = dir;
    const r = await screenAgainstSanctions({ id: 1, fullName: "John Doe" });
    await rm(dir, { recursive: true, force: true });
    expect(r.cleared).toBe(true);
    expect(r.matches).toHaveLength(0);
  });

  it("opensanctions FAILS CLOSED when the dataset is missing", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "sanctions-empty-"));
    process.env.SANCTIONS_PROVIDER = "opensanctions";
    process.env.SANCTIONS_DATA_DIR = emptyDir;
    const r = await screenAgainstSanctions({ id: 1, fullName: "John Doe" });
    await rm(emptyDir, { recursive: true, force: true });
    expect(r.cleared).toBe(false);
    expect(r.matches[0].list).toBe("SYSTEM");
  });
});

describe("KYC approval — sanctions screen is BLOCKING", () => {
  it("denies approval on a hit: KYC rejected, CRITICAL flag, tier unchanged", async () => {
    const applicant = await createUser({ kycVerified: false });
    const kyc = await prisma.kYC.create({
      data: {
        userId: applicant.id,
        fullName: "Jane Doe",
        verificationStatus: "PENDING",
      },
    });

    const dir = await makeFixtureDir([`x9,"Doe, Jane",1992-02-02,US`]);
    process.env.SANCTIONS_PROVIDER = "opensanctions";
    process.env.SANCTIONS_DATA_DIR = dir;

    const result = await kycService.approveKYC(kyc.id, applicant.id);

    await rm(dir, { recursive: true, force: true });

    expect(result.verificationStatus).toBe("REJECTED");

    const flag = await prisma.amlFlag.findFirst({
      where: { userId: applicant.id },
    });
    expect(flag?.rule).toBe("SANCTIONS_SCREEN");
    expect(flag?.severity).toBe("CRITICAL");

    const user = await prisma.user.findUnique({ where: { id: applicant.id } });
    expect(user?.tier).toBe("BASIC"); // never promoted

    const audit = await prisma.auditLog.findFirst({
      where: { userId: applicant.id, action: "KYC_REJECTED_SANCTIONS" },
    });
    expect(audit).toBeTruthy();

    // Compliance invariant: a blocking screen must also freeze the account
    // so no further money can move (CRITICAL → auto-freeze policy).
    const frozen = await prisma.user.findUnique({ where: { id: applicant.id } });
    expect(frozen?.isFrozen).toBe(true);
  });

  it("approves normally when the screen clears", async () => {
    const applicant = await createUser({ kycVerified: false });
    const kyc = await prisma.kYC.create({
      data: {
        userId: applicant.id,
        fullName: "Jane Doe",
        verificationStatus: "PENDING",
      },
    });

    const dir = await makeFixtureDir([`x2,"Alice Smith",1985-05-05,GB`]);
    process.env.SANCTIONS_PROVIDER = "opensanctions";
    process.env.SANCTIONS_DATA_DIR = dir;

    const result = await kycService.approveKYC(kyc.id, applicant.id);

    await rm(dir, { recursive: true, force: true });

    expect(result.verificationStatus).toBe("VERIFIED");
    const user = await prisma.user.findUnique({ where: { id: applicant.id } });
    expect(user?.tier).toBe("VERIFIED");
    expect(user?.isFrozen).toBe(false);
  });
});

describe("screenRecords — bounded result shape", () => {
  it("returns only matched entries with reasons", () => {
    const person = { id: 1, fullName: "John Doe" };
    const records: SanctionsRecord[] = [
      { list: "sanctions", name: "Doe, John" },
      { list: "peps", name: "Doe, Jane" },
    ];
    const matches = screenRecords(records, person);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ list: "sanctions", name: "Doe, John" });
    expect(matches[0].reason).toContain("overlap");
  });
});
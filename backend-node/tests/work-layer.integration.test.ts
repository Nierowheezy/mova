import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/config/database";
import { createUser, resetDatabase } from "./helpers";

/**
 * The Work layer has no HTTP surface yet, so this suite exercises the schema
 * contract directly: that the relations a case depends on actually resolve, and
 * that the two promises the module makes about the audit trail and alert intake
 * hold at the database level.
 */

beforeAll(async () => {
  await resetDatabase();
});

/** A queue with a default SLA policy, which is how a real queue is set up. */
async function seedQueue(name = `fraud-${randomUUID().slice(0, 6)}`) {
  const sla = await prisma.slaPolicy.create({
    data: { name: `sla-${randomUUID().slice(0, 6)}`, durationMinutes: 240 },
  });
  return prisma.queue.create({
    data: {
      name,
      slug: name.toLowerCase(),
      category: "FRAUD",
      defaultSlaPolicyId: sla.id,
    },
  });
}

describe("Work layer: case relations", () => {
  it("resolves every relation a case points at", async () => {
    const customer = await createUser();
    const assignee = await createUser();
    const queue = await seedQueue();

    const kyc = await prisma.kYC.create({
      data: { userId: customer.id, fullName: "Linked KYC", verificationStatus: "VERIFIED" },
    });
    const tx = await prisma.transaction.create({
      data: {
        transactionType: "DEPOSIT",
        amount: 500,
        walletId: customer.walletDbId,
        externalReference: randomUUID(),
      },
    });
    const amlFlag = await prisma.amlFlag.create({
      data: { rule: "LARGE_SINGLE_TX", userId: customer.id },
    });

    const created = await prisma.case.create({
      data: {
        title: "Unusual deposit pattern",
        queueId: queue.id,
        customerId: customer.id,
        assigneeId: assignee.id,
        transactionId: tx.id,
        kycId: kyc.id,
        amlFlagId: amlFlag.id,
        slaPolicyId: queue.defaultSlaPolicyId,
      },
    });

    // Read it all back through relations, not raw ids, so a mis-wired back-
    // relation surfaces here rather than at the first API call.
    const loaded = await prisma.case.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        queue: { include: { defaultSlaPolicy: true } },
        customer: true,
        assignee: true,
        transaction: true,
        kyc: true,
        amlFlag: true,
        slaPolicy: true,
      },
    });

    expect(loaded.queue.category).toBe("FRAUD");
    expect(loaded.queue.defaultSlaPolicy?.durationMinutes).toBe(240);
    expect(loaded.customer.email).toBe(customer.email);
    expect(loaded.assignee.email).toBe(assignee.email);
    expect(loaded.transaction.id).toBe(tx.id);
    expect(loaded.kyc?.id).toBe(kyc.id);
    expect(loaded.amlFlag?.rule).toBe("LARGE_SINGLE_TX");
    expect(loaded.slaPolicy?.durationMinutes).toBe(240);

    // The back-relations on the banking side must agree, or a case would be
    // invisible from the drawer that reads the customer record.
    const fromUser = await prisma.user.findUniqueOrThrow({
      where: { id: customer.id },
      include: { casesAsCustomer: true },
    });
    expect(fromUser.casesAsCustomer.map((c) => c.id)).toContain(loaded.id);

    const fromTx = await prisma.transaction.findUniqueOrThrow({
      where: { id: tx.id },
      include: { cases: true },
    });
    expect(fromTx.cases.map((c) => c.id)).toContain(loaded.id);
  });

  it("refuses a customerId that does not exist", async () => {
    const queue = await seedQueue();

    // Referential integrity is the reason these are real foreign keys rather
    // than a generic (entityType, entityId) pair, so the database must reject
    // a dangling reference outright.
    await expect(
      prisma.case.create({
        data: { title: "Dangling", queueId: queue.id, customerId: 2_147_483_600 },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("keeps every banking relation optional", async () => {
    const queue = await seedQueue();
    const bare = await prisma.case.create({
      data: { title: "No subject yet", queueId: queue.id },
    });
    expect(bare.customerId).toBeNull();
    expect(bare.transactionId).toBeNull();
    expect(bare.dueAt).toBeNull();
  });
});

describe("Work layer: audit trail", () => {
  it("keeps one trail: audit rows insert with and without a case", async () => {
    const admin = await createUser();
    const customer = await createUser();
    const queue = await seedQueue();
    const workCase = await prisma.case.create({
      data: { title: "Freeze review", queueId: queue.id, customerId: customer.id },
    });

    // Pre-Work-layer action: no case attached. This must keep working, because
    // the existing admin flow writes rows this way and must not be forced to
    // invent a case.
    const standalone = await prisma.auditLog.create({
      data: { userId: admin.id, action: "FREEZE_USER", targetId: customer.id },
    });
    expect(standalone.caseId).toBeNull();

    // Work-layer action: attached to the case it happened on.
    const attached = await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "ESCALATE_CASE",
        targetId: workCase.id,
        caseId: workCase.id,
      },
    });
    expect(attached.caseId).toBe(workCase.id);

    // Both land in the same table, so the compliance history is not split.
    const all = await prisma.auditLog.findMany({
      where: { userId: admin.id },
      orderBy: { id: "asc" },
    });
    expect(all.map((a) => a.action)).toEqual(["FREEZE_USER", "ESCALATE_CASE"]);

    const fromCase = await prisma.case.findUniqueOrThrow({
      where: { id: workCase.id },
      include: { auditLogs: true },
    });
    expect(fromCase.auditLogs.map((a) => a.action)).toEqual(["ESCALATE_CASE"]);
  });
});

describe("Work layer: alert intake", () => {
  it("holds an alert unadopted, then adopts it into exactly one case", async () => {
    const customer = await createUser();
    const queue = await seedQueue();
    const amlFlag = await prisma.amlFlag.create({
      data: { rule: "VELOCITY_SPIKE", userId: customer.id },
    });

    // Normal state before triage: in the stream, not yet anyone's work.
    const alert = await prisma.alert.create({
      data: {
        rule: "VELOCITY_SPIKE",
        source: "AML",
        severity: "HIGH",
        title: "Velocity spike",
        userId: customer.id,
        amlFlagId: amlFlag.id,
        details: { count: 12, windowMinutes: 60 },
      },
    });
    expect(alert.caseId).toBeNull();
    expect(alert.status).toBe("NEW");

    // Adoption: the alert is attached to the case, so the link is written on
    // the alert (which owns the foreign key), not on the case.
    const adopted = await prisma.case.create({
      data: {
        title: "Velocity spike review",
        queueId: queue.id,
        customerId: customer.id,
        amlFlagId: amlFlag.id,
      },
    });
    const attached = await prisma.alert.update({
      where: { id: alert.id },
      data: { caseId: adopted.id, status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
    });
    expect(attached.caseId).toBe(adopted.id);

    const fromCase = await prisma.case.findUniqueOrThrow({
      where: { id: adopted.id },
      include: { alert: true },
    });
    expect(fromCase.alert?.id).toBe(alert.id);

    // A case has exactly one origin: the unique constraint on Alert.caseId
    // must reject a second alert claiming the same case.
    const rival = await prisma.alert.create({
      data: { rule: "STRUCTURING", source: "AML", severity: "MEDIUM", title: "Rival" },
    });
    await expect(
      prisma.alert.update({ where: { id: rival.id }, data: { caseId: adopted.id } }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });
});

describe("Work layer: SLA deadline", () => {
  it("round-trips a dueAt copied from the policy at open time", async () => {
    const queue = await seedQueue();
    // A deadline computed by the future SLA calculator, then frozen.
    const dueAt = new Date("2026-10-01T09:00:00.000Z");

    const created = await prisma.case.create({
      data: { title: "Needs review", queueId: queue.id, dueAt },
    });
    const loaded = await prisma.case.findUniqueOrThrow({ where: { id: created.id } });
    expect(loaded.dueAt?.toISOString()).toBe(dueAt.toISOString());

    // Editing the policy must not move the deadline of a case already in
    // flight, which is why the live deadline is stored on the case.
    await prisma.slaPolicy.update({
      where: { id: queue.defaultSlaPolicyId! },
      data: { durationMinutes: 60 },
    });
    const after = await prisma.case.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.dueAt?.toISOString()).toBe(dueAt.toISOString());
  });
});

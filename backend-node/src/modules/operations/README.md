# Operations module

The Mintbank **Work layer**: queues of work around a shared customer record. This
is the operations cockpit's data foundation. The banking engine it sits on is the
existing Mova backend, which this module **reads** and never writes to.

> Status: schema and scaffolding only. No HTTP surface ships with the Work layer
> foundation; endpoints arrive with the Operations API feature.

## Entities

| Entity | Purpose |
|---|---|
| `Queue` | A unit of work: Fraud, KYC, Loans, or Support. Owns its cases and points at a default SLA policy. |
| `Case` | The central work record. Belongs to a queue; links to a customer, transaction, KYC record, or AML flag; carries status, priority, assignee, and resolution. |
| `Task` | A checklist item on a case, optionally assigned to a staff user. |
| `Alert` | A detected exception that can raise a case. Source-agnostic: an AML rule hit, a ledger reconciliation break, a KYC SLA breach. |
| `SlaPolicy` | How long a queue's work must be handled within. |
| `AuditLog` (extended) | Every controlled action, now linkable to the case it happened on. |

## Decisions worth knowing before you build on this

These were judgement calls, not accidents. Changing them later means a migration
across every dependent feature.

1. **`AuditLog` was extended, not duplicated.** The project plan asked for a new
   `AuditEvent` entity, but `AuditLog` already records actor, action, target,
   details, ip, user agent, and timestamp, and the existing admin flow already
   writes it for every controlled action. A second table would split the audit
   trail in two, which is the worst possible outcome for a compliance product.
   The Work layer adds a nullable `caseId` and nothing else.

2. **`Alert` is new, `AmlFlag` is untouched.** `AmlFlag` already models an AML
   rule hit with severity and review status, but it is AML-only. Operations needs
   one "Needs Attention" stream spanning AML, ledger reconciliation, and KYC SLA
   breaches, so `Alert` is source-agnostic and may reference an `AmlFlag`.
   Folding `Alert` into `AmlFlag` would have meant rewriting AML logic, which is
   out of bounds.

3. **The SLA entity is `SlaPolicy`, and deadlines are denormalised.** The policy
   holds a duration, not an instance, so a model named `Sla` would be
   misleading. `Case.dueAt` is copied from the active policy when the case opens
   and is never recomputed: editing a policy must not retroactively move
   deadlines on cases already in flight.

4. **Relations to banking entities are explicit nullable foreign keys**, not a
   generic `(entityType, entityId)` pair. Referential integrity is a regulatory
   requirement here, and queue queries need real indexed foreign keys.

5. **RBAC is deliberately not here.** `UserRole` still holds only
   `USER | ADMIN | SUPPORT`. `assigneeId` points at `User` with no role
   constraint, because widening the roles to the seven operational roles is its
   own feature and doing it here would couple the two.

## Boundary: what this module must never do

The following hold money movement, the ledger, and identity. They are read-only
to the Work layer, and no change to their business logic belongs in this module
or any feature that extends it:

- `src/services/ledger.service.ts` and the `LedgerAccount` / `LedgerEntry` models
  (`LedgerEntry` is append-only: never updated, never deleted)
- `src/modules/transfer/`, `src/modules/deposit/`, `src/modules/withdraw/`
- `src/modules/webhook/` (Stripe signature verification)
- `src/modules/auth/` (JWT, refresh tokens, 2FA)
- `src/services/aml.service.ts`

The operations layer surfaces exceptions to a human. It does not move money, and
it does not decide on its own that a transaction should be blocked.

## What comes next

| Feature | Adds |
|---|---|
| 2. Role-Based Access Control | Widens `UserRole` to the seven operational roles, so `assigneeId` and the audit actor carry real permissions. |
| 3. Operations API | Routes, controllers, services, and the SLA deadline calculator that populates `Case.dueAt`. |
| 4. Customer 360 API | The single aggregation payload the dashboard and drawer read. |

Deeper narrative documentation lands in the repository's top-level `docs/` as
numbered topic files once the API surface exists, matching the existing
`docs/01-architecture.md` convention.

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

5. **Roles are a stored fact; permissions are code.** `UserRole` on the user row
   answers "what is this person?". What they may *do* lives in
   [`rbac/permissions.ts`](./rbac/permissions.ts), because policy belongs in
   something a reviewer can diff, not in a column. `assigneeId` still points at
   `User` with no database-level role constraint, because PostgreSQL cannot
   express it: the Operations API validates that an assignee is a staff role at
   write time.

## Roles and permissions

`UserRole` holds eight values. Seven are internal staff; `USER` is a bank
**customer** and holds no operations permission at all.

| `UserRole` | Who they are |
|---|---|
| `USER` | A customer of the bank. Not staff. Holds nothing. |
| `SUPPORT` | Customer Service. Reads work and resolves it. |
| `ADMIN` | Administrator. Holds every permission. |
| `OPERATIONS_MANAGER` | The primary persona. Exceptions across teams, SLA tracking, workload. |
| `FRAUD_ANALYST` | Investigates alerts; blocks, clears, escalates. |
| `KYC_REVIEWER` | Compares documents to an application against a 48h SLA. |
| `LOAN_OFFICER` | Checks DBR and policy limits. |
| `COMPLIANCE_OFFICER` | Receives escalations; relies on the audit trail. |

`ADMIN` and `SUPPORT` predate the Work layer and keep those names so existing
users and the admin middleware are untouched. `ADMIN` is the plan's
"Administrator" and `SUPPORT` is its "Customer Service".

### The matrix

`ADMIN` holds all sixteen permissions and `USER` holds none. The table below
lists the other six staff roles. `SUPPORT` holds `queue.view`, `case.view`,
`case.resolve`, `alert.view`, and `customer.view`: it reads work and resolves
it, but does not assign it.

| Permission | Grants | Held by (other than ADMIN) |
|---|---|---|
| `queue.view` | see queues and case counts | all staff |
| `queue.manage` | create, edit, deactivate queues; set default SLA | OPERATIONS_MANAGER |
| `case.view` | see cases | all staff |
| `case.assign` | assign or reassign a case or task | OPERATIONS_MANAGER, FRAUD_ANALYST |
| `case.resolve` | resolve with a recorded reason | OPERATIONS_MANAGER, FRAUD_ANALYST, KYC_REVIEWER, LOAN_OFFICER, SUPPORT |
| `case.escalate` | escalate out of the queue | OPERATIONS_MANAGER, FRAUD_ANALYST, COMPLIANCE_OFFICER |
| `alert.view` | the "Needs Attention" stream | OPERATIONS_MANAGER, FRAUD_ANALYST, KYC_REVIEWER, COMPLIANCE_OFFICER, SUPPORT |
| `alert.acknowledge` | triage an alert into a case | OPERATIONS_MANAGER, FRAUD_ANALYST, KYC_REVIEWER |
| `kyc.review` | decide a KYC application | KYC_REVIEWER |
| `loan.review` | decide a loan application | LOAN_OFFICER |
| `customer.view` | Customer 360 | all staff |
| `action.execute` | controlled actions: freeze, block, clear an AML flag | FRAUD_ANALYST, COMPLIANCE_OFFICER |
| `audit.view` | read the audit trail | OPERATIONS_MANAGER, COMPLIANCE_OFFICER |
| `report.view` | analytics and reporting | OPERATIONS_MANAGER, COMPLIANCE_OFFICER |
| `user.role.manage` | change a user's role | — (ADMIN only) |
| `permission.manage` | manage the permission matrix | — (ADMIN only) |

Read the matrix from the source, not from this table. The table is here so the
policy is reviewable by a human in a diff; `tests/unit/permissions.test.ts` is
what keeps it honest.

### Enforcing it

`requirePermission(permission)` in
[`rbac/permission.middleware.ts`](./rbac/permission.middleware.ts) is the
enforcement point. It reads the role from the database on **every request**
rather than trusting a JWT claim, so demoting or disabling a staff account takes
effect immediately instead of at token expiry. `src/config/jwt.ts` is therefore
not modified: `JwtPayload` stays `{ userId, email }`.

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
| 2. Role-Based Access Control | **Shipped.** Widened `UserRole` to the seven operational roles and defined the permission matrix. |
| 3. Operations API | Routes, controllers, services, guarded by `requirePermission`, and the SLA deadline calculator that populates `Case.dueAt`. |
| 4. Customer 360 API | The single aggregation payload the dashboard and drawer read. |

Deeper narrative documentation lands in the repository's top-level `docs/` as
numbered topic files once the API surface exists, matching the existing
`docs/01-architecture.md` convention.

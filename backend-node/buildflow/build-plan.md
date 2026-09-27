# Build Plan

> One of the two planning docs you provide. Write it directly, develop it through
> any AI conversation, or optionally run `/discovery`. Keep the items high-level
> even when `project-plan.md` is detailed; later `/feature` specs hold the depth
> for each build item.

The features that make up this project, high level and in rough build order, one
line each, no detail (that comes per feature). Rough is fine at first, but before
`/overview` runs this file should be shaped into a checkbox list the build loop
can track.

Keep it as a checklist. Run `/feature` with no number to spec the **next
unchecked** item, or `/feature 3` / `/feature "login"` to pick a specific one.
Completed features get checked off here, so the build plan doubles as your
progress tracker. A big item gets split into sub-items (4a, 4b, etc.) when you
spec it.

## Continuing after the initial build

This is a living roadmap, not a plan that freezes when the first release is
done. Keep completed items checked, then append new unchecked features as the
project grows. Optional milestone headings such as `## MVP` and `## Post-MVP`
keep a longer plan readable without changing how `/feature` finds the next
unchecked item.

Do not renumber completed features because their archived specs refer back to
those numbers. Continue with the next unused number. If a new feature materially
changes the product direction, users, data, stack, monetization, UI/UX, or
deployment, update the relevant part of `project-plan.md` too. Then re-run
`/overview` before spec'ing the feature.

You can edit this file directly or ask the AI to start a new feature by name. If
`/feature "team workspaces"` does not match an existing item, it will propose the
new build-plan line and any necessary project-plan changes, wait for approval,
refresh the overview, and then write the feature spec.

Scaffolding the app (create-next-app, etc.) and prototyping the look are
pre-build steps, not features (see the README), so don't list them here. Start
with your first real slice of functionality.

A common order that works well: build the core UI with placeholder data first,
then wire up data, auth, and integrations. Add deployment readiness only when
the app is worth shipping or a provider config change is part of the work. Adapt
it to your project.

## Format

Use checkboxes. Each item should be a feature-sized outcome, not a loose task or
a whole product area.

Good:

- `1. Skill submission` — upload a skill package and save its metadata
- `2. Validation result` — run checks and show pass/fail status for a skill
- `3. Directory listing` — browse and filter published skills
- `4. Deployment readiness` — configure Render or Vercel and verify the
  production build

> These are illustrative examples from the template, not plan items. They are
> written without checkboxes on purpose: the real plan starts at `## MVP`, and
> a future `/feature` must not pick an example out of this section.

Avoid:

- Upload stuff
- Database
- Make it look nice
- Auth, billing, dashboard, validation, and deploy

If your first pass is just rough bullets, that is okay. Run `/overview` after filling both planning docs; it will flag plan-shape problems and can propose a cleaned-up checkbox version before generating the project overview.

## MVP

- [x] 1. **Work Layer Backend** - add Prisma models for Queue, Case, Alert, SLA, and AuditEvent
- [ ] 2. **Role-Based Access Control** - expand user roles to the 7 operational roles and define permissions
- [ ] 3. **Operations API** - build endpoints for fetching queues, assigning cases, and resolving actions
- [ ] 4. **Customer 360 API** - build an aggregation endpoint to fetch all customer data in one payload
- [ ] 5. **Operations Dashboard UI** - build the exceptions-first layout with KPI cards and "Needs Attention" queue
- [ ] 6. **Queue Management UI** - build the queue list view with SLA timers, filters, and priority sorting
- [ ] 7. **Investigation Drawer UI** - build the transaction details view with risk score and "Why flagged" reasons
- [ ] 8. **Controlled Action Workflow** - implement mandatory reason inputs, acknowledgement checkboxes, and audit log generation
- [ ] 9. **KYC Workspace UI** - build the 3-column layout with document viewer and verification checklist
- [ ] 10. **Customer 360 UI** - build the unified view aggregating balances, KYC, alerts, and support cases

## Post-MVP

- [ ] 11. **Mint AI Assistant** - build the floating orb UI and RAG backend for grounded policy answers
- [ ] 12. **Analytics & Reporting Dashboard** - build operational performance metrics (volume, success rate, fraud losses prevented)
- [ ] 13. **Admin Settings UI** - build the role management and permissions matrix interface
- [ ] 14. **Arabic RTL & Dark Mode Support** - implement full localization and dark theme
- [ ] 15. **Loan Decision Workflow UI** - build the application review, policy checks, and decision panel
- [ ] 16. **Support Case Resolution UI** - build the conversation timeline, internal notes, and SLA timer

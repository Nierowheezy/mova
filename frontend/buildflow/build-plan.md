# Build Plan

> One of the two planning docs for the FinanceOS redesign. This document defines the
> high-level features that make up the frontend redesign and the order in which they
> should be implemented.
>
> Keep each item feature-sized and high-level. Detailed requirements, UI decisions,
> implementation notes, edge cases, API considerations, and acceptance criteria belong
> in the individual `/feature` specifications.
>
> This project is a redesign of an existing, fully implemented fintech application.
> The build plan therefore focuses primarily on frontend UX/UI outcomes while
> preserving the existing backend, API contracts, authentication, Stripe integration,
> business logic, and data model.
>
> Keep this file as a checkbox list so the build loop can track progress.
> Run `/feature` with no number to spec the **next unchecked** item, or use
> `/feature 3` / `/feature "transactions"` to select a specific feature.
>
> Completed features should be checked off here. Do not renumber completed features
> because their archived feature specifications may refer to their original numbers.
> If a feature becomes large during specification, split it into sub-items such as
> 4a, 4b, etc. without renumbering previously completed features.

## Continuing after the initial build

This is a living roadmap for the FinanceOS frontend.

The initial MVP covers the redesign of the existing product and establishes a consistent
FinanceOS visual system across the public website and authenticated application.

After the MVP is complete:

- Keep completed items checked.
- Append new features using the next unused number.
- Do not renumber existing features.
- Use optional milestone headings such as `## MVP` and `## Post-MVP` to keep the roadmap readable.
- Keep each new item feature-sized and outcome-focused.
- Update `project-plan.md` if a new feature materially changes the product direction, users, data, technology stack, monetization, UI/UX direction, or deployment architecture.
- Re-run `/overview` after material project-plan changes and before specifying dependent features.
- Use `/feature "feature name"` when adding a new capability that does not already exist in the build plan.

The existing FinanceOS backend and product functionality should remain the source of truth.
New frontend features should reuse existing API capabilities where possible rather than
creating duplicate business logic.

## Build order

The redesign follows a deliberate dependency order:

1. Establish the shared design system.
2. Establish the authenticated application shell.
3. Redesign the dashboard and use it to validate the visual direction.
4. Redesign the core financial workflows.
5. Redesign supporting product areas.
6. Redesign authentication and the public landing page.
7. Apply global UX, responsive, accessibility, and theme refinements.
8. Validate the complete application and production build.

The build plan should not contain implementation-level tasks such as creating individual
components, changing individual Tailwind classes, writing API functions, or modifying
database queries. Those details belong in the relevant `/feature` specification.

The build plan should also not treat existing infrastructure as new functionality.
Authentication, backend APIs, database operations, Stripe processing, and existing business
logic are already implemented and should be preserved unless a future feature explicitly
requires a change.

## MVP

- [ ] 1. **FinanceOS design system** - establish the core visual language and reusable UI foundation for the redesigned application

- [ ] 2. **Dashboard shell** - redesign the authenticated application shell with navigation, header, responsive layout, and theme support

- [ ] 3. **Dashboard overview** - redesign the financial overview experience with balance, actions, savings, beneficiaries, and recent activity

- [ ] 4. **Wallet funding** - redesign the wallet funding experience while preserving the existing Stripe payment flow

- [ ] 5. **Wallet withdrawal** - redesign the wallet withdrawal experience with clear balance, amount, confirmation, and result states

- [ ] 6. **Money transfer** - redesign the recipient verification, transfer, PIN, beneficiary, confirmation, and completion experience

- [ ] 7. **Transactions** - redesign transaction lists, transfer history, transaction status, filtering, responsive views, and transaction details

- [ ] 8. **Savings goals** - redesign savings goal creation, progress, details, deposits, withdrawals, and goal activity

- [ ] 9. **Beneficiaries** - redesign beneficiary management, search, creation, deletion, and send-money flows

- [ ] 10. **KYC verification** - redesign identity verification, document upload, submission, and verification status experiences

- [ ] 11. **Notifications** - redesign notification browsing, unread states, read actions, transaction links, and empty states

- [ ] 12. **Authentication** - redesign login, signup, authentication states, redirects, and future 2FA presentation

- [ ] 13. **FinanceOS landing page** - replace the existing Canopy-inspired landing page with a cohesive FinanceOS marketing experience

- [ ] 14. **Global UX states** - standardize loading, empty, error, validation, confirmation, success, and toast experiences across the application

- [ ] 15. **Responsive experience** - refine the redesigned application for desktop, tablet, and mobile screen sizes

- [ ] 16. **Accessibility and interaction polish** - improve focus states, keyboard navigation, contrast, labels, motion, and interaction consistency

- [ ] 17. **Production readiness** - verify the redesigned frontend builds, routes correctly, uses production environment configuration, and is ready for deployment

- [ ] 18. **End-to-end QA** - verify the redesigned frontend against all existing authentication, wallet, payment, transfer, savings, KYC, beneficiary, transaction, and notification flows

## Post-MVP

- [ ] 19. **Profile and settings** - redesign account profile, preferences, and security settings

- [ ] 20. **Financial insights** - add richer visual summaries and insights for wallet activity, transactions, and savings

- [ ] 21. **Advanced transaction filtering** - add expanded transaction filtering and discovery capabilities

- [ ] 22. **Security center** - provide a dedicated experience for PIN, 2FA, sessions, and account security

- [ ] 23. **Additional financial products** - introduce new FinanceOS financial products and experiences as the product expands

## Build-plan rules

- Each checkbox represents a feature-sized outcome.
- Keep descriptions to one line.
- Do not put detailed acceptance criteria in this file.
- Do not put implementation steps in this file.
- Do not create separate items for individual UI components.
- Do not create separate items for individual API endpoints.
- Do not create separate items for individual loading, error, or success states when they belong to a larger feature.
- Preserve existing functionality unless the feature explicitly changes it.
- Do not modify backend contracts as part of a visual redesign unless required and explicitly documented.
- Do not introduce new infrastructure merely to support visual changes.
- Use `/feature` to turn an unchecked item into a detailed implementation specification.
- Use `/feature` with no number to work on the next unchecked item.
- Use `/feature <number>` to work on a specific numbered item.
- Use `/feature "<name>"` to select a matching feature by name.
- When a feature is completed, mark its checkbox as checked.
- Never renumber completed features.
- New features always receive the next unused number.
- If a new feature materially changes the product direction, update `project-plan.md` before implementation.
- Re-run `/overview` after material planning changes before continuing feature specification.

# Project Plan

> FinanceOS is an existing fintech/neobank SPA with a working Node.js backend, authentication, wallet, transfers, Stripe funding, withdrawals, savings, KYC, beneficiaries, transactions, and notifications.
>
> This project is focused on redesigning and improving the frontend experience while preserving the existing product functionality and backend contracts.

## 1. Problem - What problem are we solving?

FinanceOS currently provides the core functionality of a digital banking product, but its frontend experience does not yet have a cohesive, purpose-built fintech identity.

The current application contains functional dashboard pages, wallet operations, transfers, savings, KYC, beneficiaries, transactions, and notifications, but the visual system is inconsistent with the quality expected from a modern financial product. The public landing page also currently uses a Canopy-inspired design that is disconnected from the FinanceOS authenticated application.

The project will redesign FinanceOS into a cohesive, modern, trustworthy financial application while keeping the existing backend and business functionality intact.

The redesign should improve:

- Visual consistency across the entire application.
- Financial information hierarchy and readability.
- Navigation and discoverability of important actions.
- Wallet, transfer, funding, withdrawal, and savings experiences.
- Transaction presentation.
- KYC and security-related experiences.
- Responsive desktop and mobile usability.
- Loading, empty, success, and error states.
- Light and dark theme consistency.
- The relationship between the public marketing site and the authenticated application.

### Core constraint

This is primarily a **frontend redesign project**, not a backend rewrite.

Existing API contracts, authentication behaviour, payment processing, transaction logic, savings logic, KYC processing, and data models should remain unchanged unless a specific feature explicitly requires a backend change.

## 2. Users - Who is this for?

FinanceOS is designed for individuals who want to manage their everyday finances through a digital banking experience.

Primary users:

- Individuals managing a digital wallet.
- Users sending and receiving money through wallet IDs.
- Users funding their wallet with a bank card.
- Users withdrawing money from their wallet.
- Users creating and managing savings goals.
- Users managing frequently used beneficiaries.
- Users completing KYC verification.
- Users monitoring their financial transactions.

The UI should work for both financially experienced users and users who are less familiar with digital financial products.

The interface should therefore prioritize clarity over financial jargon and make important financial actions understandable without requiring users to understand the underlying implementation.

## 3. Features - What does the MVP need?

### Authentication

- User registration and login.
- Session restoration and access-token refresh.
- Logout.
- Redirect handling for protected pages.
- Existing 2FA placeholder support.

### Dashboard

- Financial overview.
- Wallet balance.
- Savings summary.
- Beneficiary summary.
- Recent transactions.
- Quick financial actions.

### Wallet

- Fund wallet through Stripe.
- Withdraw from wallet.
- Display available balance.
- Display funding and withdrawal states.

### Transfers

- Transfer money using wallet ID.
- Verify recipient wallet.
- Enter transaction PIN.
- Save recipient as beneficiary.
- Display transfer confirmation and result.

### Transactions

- View all transactions.
- View transfer transactions.
- Search/filter presentation.
- View transaction details.
- Display transaction status and references.

### Savings

- View savings goals.
- Create savings goals.
- Track goal progress.
- Deposit into savings goals.
- Withdraw from eligible savings goals.
- View savings goal transactions.

### Beneficiaries

- View beneficiaries.
- Search beneficiaries.
- Add beneficiary.
- Delete beneficiary.
- Send money to a beneficiary.

### KYC

- View KYC status.
- Submit personal information.
- Select identification type.
- Upload identification document.
- Display verification status.

### Notifications

- View notifications.
- Mark individual notifications as read.
- Mark all notifications as read.
- Navigate from transaction notifications to transactions.

### Themes and responsive UX

- Light theme.
- Dark theme.
- Responsive desktop layout.
- Responsive tablet layout.
- Responsive mobile layout.

### Public website

- FinanceOS-branded landing page.
- Product introduction.
- Feature presentation.
- Trust/security messaging.
- Calls to action.
- Responsive marketing experience.

## 4. Data - What are we storing?

The frontend consumes and displays data from the existing Node.js backend.

The redesign should not introduce a new primary data store.

Existing product data includes:

- Users.
- Authentication/session information.
- User roles and account status.
- Wallets.
- Wallet balances.
- Wallet IDs.
- KYC profiles.
- KYC verification status.
- Uploaded identification documents.
- Beneficiaries.
- Transfers.
- Transactions.
- Transaction references.
- External transaction references.
- Transaction statuses.
- Savings goals.
- Savings goal balances and targets.
- Savings goal transactions.
- Notifications.
- Notification read/unread state.

Sensitive financial and identity information should continue to be handled by the existing backend rather than stored unnecessarily in browser storage.

The frontend should continue using HTTP-only cookies for session-related functionality and in-memory access-token handling as currently implemented.

## 5. Tech - What stack are we using?

### Frontend

- Vite 6.
- React 19.
- TypeScript 5.8.
- React Router 7.
- Tailwind CSS 4.
- DaisyUI 5 where existing components are retained or useful.
- Lucide React for icons.
- Framer Motion for purposeful animations.
- Sonner for toast notifications.
- Axios for API communication.

### Payments

- Stripe.
- `@stripe/react-stripe-js`.
- `@stripe/stripe-js`.

Stripe remains responsible for the existing wallet card-funding flow.

### Backend

The existing Node.js backend remains the source of truth for application functionality.

The frontend communicates with:

```text
/api/v1
```

through the configured `VITE_API_URL`.

### Existing frontend architecture

Continue using:

- React Context for authentication.
- Existing `AuthContext`.
- Existing protected routes.
- Existing API client.
- Existing `src/libs/core.ts` mapping layer.
- Existing `src/libs/user.ts` API mapping layer.

Do not introduce Redux, Zustand, or another global state library solely for the redesign.

### Design system

The redesign should establish reusable FinanceOS components and tokens rather than styling every page independently.

The design system should cover:

- Typography.
- Colors.
- Spacing.
- Borders.
- Radius.
- Shadows.
- Buttons.
- Inputs.
- Selects.
- Cards.
- Tables.
- Status badges.
- Dialogs/modals.
- Navigation.
- Tabs.
- Progress indicators.
- Skeletons.
- Empty states.
- Error states.
- Toasts.

### Explicit technical exclusion

The redesign should not:

- Replace React.
- Replace Vite.
- Replace the Node backend.
- Replace Stripe.
- Replace the existing authentication architecture.
- Introduce a new database.
- Rewrite API endpoints without necessity.
- Replace the existing data layer merely for stylistic reasons.

## 6. Monetize - How will this make money?

The current application is a fintech/neobank product, but the frontend redesign itself does not introduce a new monetization system.

Existing or future monetization may come from financial-service economics such as:

- Transaction fees.
- Transfer fees.
- Payment processing economics.
- Withdrawal/payout fees.
- Premium financial features.
- Other financial products introduced by the business.

The redesign should therefore support future monetization without hardcoding a specific pricing model into the UI.

Financial fees, limits, and charges should be provided by the backend rather than calculated or invented by the frontend.

## 7. UI/UX - How should this look and feel?

FinanceOS should feel like a **modern digital banking product**, not a generic SaaS dashboard.

### Overall direction

The design should be:

- Premium.
- Minimal.
- Trustworthy.
- Financially focused.
- Clear.
- Calm.
- Modern.
- Fast.
- Information-dense where appropriate.
- Spacious where information needs emphasis.

The interface should prioritize **financial clarity over decoration**.

### Brand

The current Canopy-inspired landing page should be replaced with a FinanceOS-specific visual identity.

The authenticated application and public website should feel like the same product.

The exact final color palette, typography, and visual language will be established during the design-system phase.

### Dashboard

The dashboard should immediately communicate:

1. How much money the user has.
2. What they can do with it.
3. What financial activity has happened recently.
4. How their savings are progressing.
5. Anything requiring their attention.

The primary balance should have strong visual hierarchy.

Common actions such as:

- Transfer.
- Fund wallet.
- Withdraw.
- Create savings goal.

should be easily accessible without overwhelming the interface.

### Financial information

Amounts, balances, dates, references, statuses, and transaction types should have consistent formatting throughout the application.

Positive, pending, failed, and attention-required states should be visually distinguishable without relying solely on color.

### Navigation

The navigation should make the major product areas immediately understandable.

The desktop experience may use a persistent sidebar while the mobile experience should use an intentionally designed mobile navigation pattern.

### Forms

Financial forms should:

- Clearly explain what information is required.
- Show validation close to the relevant field.
- Preserve entered information when possible.
- Clearly communicate processing state.
- Prevent accidental duplicate submissions.
- Provide explicit success and failure feedback.

### Money movement

Funding, transfers, and withdrawals should use clear multi-step or confirmation patterns where appropriate.

Users should always understand:

- What action they are performing.
- How much money is involved.
- Who is receiving money.
- Whether the action succeeded.
- What happens next.

### KYC

KYC should feel secure and trustworthy.

The interface should clearly communicate:

- Why information is being requested.
- What document is required.
- Upload progress/state.
- Submission status.
- Verification status.
- Whether additional action is required.

### Transactions

Transactions should be easy to scan.

The design should support:

- Strong amount hierarchy.
- Clear transaction type.
- Clear status.
- Human-readable dates.
- Transaction references.
- Easy access to transaction details.

### Savings

Savings should visually communicate progress toward goals.

Goal cards should make it immediately obvious:

- Goal name.
- Current amount.
- Target amount.
- Percentage/progress.
- Target date.
- Whether deposits or withdrawals are available.

### Empty states

Empty states should explain what the user can do next rather than simply saying that there is no data.

Examples:

- No transactions → explain how activity will appear.
- No savings goals → provide a clear create-goal action.
- No beneficiaries → explain how to add one.
- No notifications → communicate that the inbox is clear.

### Loading states

Use skeletons or appropriate loading indicators instead of large blank areas.

Loading states should preserve the expected page layout where possible.

### Error states

Errors should be understandable to users and should not expose raw backend errors, stack traces, or implementation details.

### Dark mode

Dark mode should be intentionally designed rather than simply applying a dark background to the light theme.

Both themes should maintain:

- Readability.
- Contrast.
- Status clarity.
- Consistent borders.
- Consistent elevation.
- Financial-data hierarchy.

### Motion

Use motion sparingly.

Animations should communicate:

- Navigation changes.
- State changes.
- Confirmation.
- Loading.
- Modal transitions.
- Important feedback.

Avoid decorative animation that makes financial workflows slower or distracting.

### Responsive design

Mobile should be treated as a first-class experience.

Important flows such as:

- Transfer.
- Fund wallet.
- Withdraw.
- Transaction detail.
- KYC.

must remain easy to complete on smaller screens.

## 8. Deployment - Where and how will this ship?

### Frontend

The frontend is a Vite SPA and can be deployed to a static frontend host such as Vercel.

Production build:

```bash
npm run build
```

Preview:

```bash
npm run preview
```

Development:

```bash
npm run dev
```

Vite output directory:

```text
dist/
```

### Required frontend environment variables

```text
VITE_API_URL
VITE_STRIPE_PUBLISHABLE_KEY
```

`VITE_API_URL` points to the existing Node backend API.

`VITE_STRIPE_PUBLISHABLE_KEY` is used by Stripe Elements for wallet funding.

### Backend

The existing Node backend remains separately deployed and exposed through the configured API URL.

The frontend should not assume the backend runs on the same host.

### Database/storage

No new frontend database or storage system is required for this redesign.

The existing backend/database remains responsible for:

- Users.
- Wallets.
- Transactions.
- Savings.
- Beneficiaries.
- KYC.
- Notifications.
- Other persistent application data.

### Deployment requirements

The deployed SPA must correctly support client-side routes such as:

```text
/login
/signup
/dashboard
/dashboard/transactions
/dashboard/transactions/:reference
/dashboard/savings/:uuid
/dashboard/kyc
```

The hosting configuration must therefore provide SPA fallback behaviour so direct navigation to frontend routes resolves to the application entry point.

### Domain

The final production domain will be determined separately.

The public landing page and authenticated FinanceOS application should ultimately operate under a coherent brand/domain structure.

### Health checks

The frontend is a static SPA and does not require a traditional application health endpoint.

Backend health checking remains the responsibility of the existing Node backend deployment.

### Deployment scope

This project does not include migrating the backend, database, payment provider, or infrastructure unless explicitly added as a separate feature.

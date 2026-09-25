// src/routes/index.tsx
// Route configuration with route-level code splitting (React.lazy + Suspense).
// Each page is its own chunk, which keeps the initial bundle small and lets
// the browser fetch only what the user actually visits.
//
// Kept eager (small, needed immediately): NotFoundPage (404), ProtectedRoute
// (auth gate) and the Landing wrapper (auth redirect logic). Everything else
// loads on demand behind a shared `<PageLoader />` fallback.

import { lazy, Suspense, type LazyExoticComponent, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate, RouteObject, useLocation } from "react-router-dom";
import NotFoundPage from "@/pages/error/NotFoundPage";
import ProtectedRoute from "@/routes/ProtectedRoute";
import { PageLoader } from "@/components/ui/PageLoader";
import { useAuth } from "@/hooks/useAuth";

const lazyPage = (loader: () => Promise<{ default: ComponentType }>) =>
    lazy(loader);

const Landing = lazyPage(() => import("@/pages/base/Index"));
const Login = lazyPage(() => import("@/pages/auth/Login"));
const Signup = lazyPage(() => import("@/pages/auth/Signup"));
const Overview = lazyPage(() => import("@/pages/dashboard/Overview"));
const Transfer = lazyPage(() => import("@/pages/dashboard/transfer/TransferNew"));
const KYC = lazyPage(() => import("@/pages/dashboard/kyc/KYC"));
const SavingsGoalNew = lazyPage(() => import("@/pages/dashboard/savings/SavingsGoalNew"));
const FundWallet = lazyPage(() => import("@/pages/dashboard/wallet/FundWallet"));
const WithdrawWallet = lazyPage(() => import("@/pages/dashboard/wallet/WithdrawWallet"));
const Transfers = lazyPage(() => import("@/pages/dashboard/transfer/Transfers"));
const SavingsGoalsList = lazyPage(() => import("@/pages/dashboard/savings/SavingGoalList"));
const SavingsGoalDetail = lazyPage(() => import("@/pages/dashboard/savings/SavingsGoalDetail"));
const Beneficiaries = lazyPage(() => import("@/pages/dashboard/beneficiaries/Beneficiaries"));
const Notifications = lazyPage(() => import("@/pages/dashboard/notification/Notifications"));
const TransactionDetail = lazyPage(() => import("@/pages/dashboard/transactions/TransactionsDetail"));
const TransactionsList = lazyPage(() => import("@/pages/dashboard/transactions/TransactionsList"));
const SettingsPage = lazyPage(() => import("@/pages/dashboard/SettingsPage"));

/** Wraps a lazy element so the Suspense fallback renders inside the layout. */
const withSuspense = (Element: LazyExoticComponent<ComponentType>) => (
    <PageTransition>
        <Suspense fallback={<PageLoader label="Loading page…" />}>
            <Element />
        </Suspense>
    </PageTransition>
);

/** Applies a subtle fade when the route changes. Keyed on the pathname so the
    animation replays on navigation; opacity-only so fixed/sticky descendants
    (drawer, overlay, sticky topbar) are unaffected. */
const PageTransition = ({ children }: { children: ReactNode }) => {
    const { pathname } = useLocation();
    return (
        <div key={pathname} className="page-enter">
            {children}
        </div>
    );
};

/** Landing page is public-only: a logged-in user gets sent to the dashboard. */
const LandingRoute = () => {
    const { isLoggedIn, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <PageLoader label="Loading…" full={false} />;
    }

    if (isLoggedIn && !location.hash) {
        return <Navigate to="/dashboard" replace state={{ from: location }} />;
    }

    return withSuspense(Landing);
};

export const routes: RouteObject[] = [
    {
        path: "/",
        errorElement: <NotFoundPage />,
        children: [
            {
                index: true,
                element: <LandingRoute />,
            },
        ],
    },

    {
        path: "/login",
        element: withSuspense(Login),
    },
    {
        path: "/signup",
        element: withSuspense(Signup),
    },

    {
        element: <ProtectedRoute />,
        children: [
            {
                path: "/dashboard",
                element: withSuspense(Overview),
            },
            {
                path: "/dashboard/transfers/new",
                element: withSuspense(Transfer),
            },
            {
                path: "/dashboard/kyc",
                element: withSuspense(KYC),
            },
            { path: "/dashboard/fund", element: withSuspense(FundWallet) },
            { path: "/dashboard/withdraw", element: withSuspense(WithdrawWallet) },

            { path: "/dashboard/transactions", element: withSuspense(TransactionsList) },
            { path: "/dashboard/transactions/:reference", element: withSuspense(TransactionDetail) },

            { path: "/dashboard/transfers", element: withSuspense(Transfers) },
            { path: "/dashboard/beneficiaries", element: withSuspense(Beneficiaries) },
            { path: "/dashboard/notifications", element: withSuspense(Notifications) },
            { path: "/dashboard/settings", element: withSuspense(SettingsPage) },

            { path: "/dashboard/savings/new", element: withSuspense(SavingsGoalNew) },
            { path: "/dashboard/savings/", element: withSuspense(SavingsGoalsList) },
            { path: "/dashboard/savings/:uuid", element: withSuspense(SavingsGoalDetail) },
        ],
    },

    // Unknown paths → styled 404 page.
    {
        path: "*",
        element: <NotFoundPage />,
    },
];

export const router = createBrowserRouter(routes);
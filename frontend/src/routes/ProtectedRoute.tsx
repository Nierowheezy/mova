import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const ProtectedRoute: React.FC = () => {
    const { isLoggedIn, loading } = useAuth();
    const location = useLocation();

    // Wait for the session check (refresh attempt) before deciding.
    // Without this, a logged-in user gets a flash of the login page.
    if (loading) {
        return (
            <div className="grid min-h-screen place-items-center bg-white text-gray-900 antialiased dark:bg-[#0a0a0a] dark:text-white">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-white/20 dark:border-t-white" />
            </div>
        );
    }

    // Not logged in → send to login, remembering where they wanted to go
    if (!isLoggedIn) {
        const redirect = `${location.pathname}${location.search}`;
        return (
            <Navigate
                to={`/login?redirect=${encodeURIComponent(redirect)}`}
                replace
            />
        );
    }

    return <Outlet />;
};

export default ProtectedRoute;
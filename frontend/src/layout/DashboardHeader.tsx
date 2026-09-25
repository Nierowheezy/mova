// src/layout/DashboardHeader.tsx
// Mova topbar - page title (derived from the route), theme popover, notifications,
// and quick actions. The account menu lives in the sidebar footer (Vercel-style,
// see SidebarUserMenu in Sidebar.tsx). Shared by every dashboard page.
import { Link, useLocation } from "react-router-dom";
import { Bell, Send, Wallet as WalletIcon } from "lucide-react";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { SidebarTrigger } from "./Sidebar";

const TITLES: Array<[string, string, string?]> = [
    ["/dashboard/transfers/new", "Send Funds", "Beneficiary, amount, review"],
    ["/dashboard/transfers", "Transfers", "Transfer history and statuses"],
    ["/dashboard/savings/new", "New Saving Goal", "Create a savings goal"],
    ["/dashboard/savings", "Savings Goals", "Track progress and automate deposits"],
    ["/dashboard/fund", "Fund Wallet", "Top up by card or bank transfer"],
    ["/dashboard/withdraw", "Withdraw", "Cash out to bank or card"],
    ["/dashboard/transactions", "Transactions", "Your full spend ledger"],
    ["/dashboard/beneficiaries", "Beneficiaries", "Saved recipients"],
    ["/dashboard/notifications", "Notifications", "Security and activity alerts"],
    ["/dashboard/kyc", "KYC", "Identity verification"],
    ["/dashboard/settings", "Settings", "Profile, wallet and security"],
    ["/dashboard", "Overview", "Live balance"],
];

const titleFor = (pathname: string): { title: string; sub: string } => {
    // Exact matches first (longest first so more specific routes win).
    for (const [p, title, sub] of TITLES) {
        if (pathname === p) return { title, sub: sub ?? "" };
    }
    // Parameterized routes.
    if (/^\/dashboard\/transactions\/.+/.test(pathname)) return { title: "Transaction Detail", sub: "Record and status timeline" };
    if (/^\/dashboard\/savings\/.+/.test(pathname)) return { title: "Goal Detail", sub: "Track progress and automate deposits" };

    return { title: "Mova", sub: "" };
};

const DashboardHeader = () => {
    const { pathname } = useLocation();
    const { title, sub } = titleFor(pathname);

    const date = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    return (
        <header className="topbar" style={{ justifyContent: "space-between" }}>
            <div className="flex items-center gap-3">
                <SidebarTrigger className="icon-btn mobile-menu-btn" />
                <div>
                    <div className="page-title">{title}</div>
                    <div className="page-sub">{sub || date}</div>
                </div>
            </div>

            <div className="topbar-actions">
                <ThemeToggleButton />

                <Link to="/dashboard/notifications" className="icon-btn" aria-label="Notifications">
                    <Bell aria-hidden="true" />
                    <span className="notif-dot" />
                </Link>

                <Link to="/dashboard/transfers/new" className="btn btn-secondary btn-sm btn-quick">
                    <Send className="h-3.5 w-3.5" />
                    Transfer
                </Link>
                <Link to="/dashboard/fund" className="btn btn-primary btn-sm btn-quick">
                    <WalletIcon className="h-3.5 w-3.5" />
                    Fund Wallet
                </Link>
            </div>
        </header>
    );
};

export default DashboardHeader;
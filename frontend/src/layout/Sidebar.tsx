// src/layout/Sidebar.tsx
// Mova sidebar - collapsible on desktop, off-canvas drawer on mobile.
// Keeps the existing public API (SidebarTrigger / DesktopSidebar / MobileSidebar)
// so all dashboard pages keep working unchanged.
import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
    LayoutGrid,
    ReceiptText,
    Send,
    Shield,
    Users,
    Bell,
    ShieldCheck,
    Settings,
    ChevronsLeft,
    ChevronUp,
    X,
    Menu,
    LogOut,
    HelpCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme, type Theme } from "@/hooks/useTheme";

export type NavItem = { label: string; to: string; icon: React.ReactNode };

const MENU: NavItem[] = [
    { label: "Overview", to: "/dashboard", icon: <LayoutGrid /> },
    { label: "Transactions", to: "/dashboard/transactions", icon: <ReceiptText /> },
    { label: "Transfers", to: "/dashboard/transfers", icon: <Send /> },
    { label: "Savings", to: "/dashboard/savings", icon: <Shield /> },
];

const MANAGE: (NavItem & { muted?: boolean })[] = [
    { label: "Beneficiaries", to: "/dashboard/beneficiaries", icon: <Users /> },
    { label: "Notifications", to: "/dashboard/notifications", icon: <Bell /> },
    { label: "KYC", to: "/dashboard/kyc", icon: <ShieldCheck /> },
    { label: "Settings", to: "/dashboard/settings", icon: <Settings /> },
];

/* ----------------------------------------------------------------
 *  Event-based triggers so pages don't manage local state
 *  ---------------------------------------------------------------- */
const OPEN_EVT = "sidebar:open";
const CLOSE_EVT = "sidebar:close";
const TOGGLE_EVT = "sidebar:toggle";

function onOpen() {
    document.dispatchEvent(new CustomEvent(OPEN_EVT));
}
function onClose() {
    document.dispatchEvent(new CustomEvent(CLOSE_EVT));
}
function onToggle() {
    document.dispatchEvent(new CustomEvent(TOGGLE_EVT));
}

/** Use this anywhere (e.g., topbar) to open/toggle the mobile drawer. */
export function SidebarTrigger({ variant = "toggle", className = "", children, "aria-label": ariaLabel }: { variant?: "open" | "toggle"; className?: string; children?: React.ReactNode; "aria-label"?: string }) {
    return (
        <button onClick={variant === "open" ? onOpen : onToggle} aria-label={ariaLabel ?? (variant === "open" ? "Open menu" : "Toggle menu")} className={className || "icon-btn mobile-menu-btn"}>
            {children ?? <Menu className="h-4 w-4" />}
        </button>
    );
}

/* ----------------------------------------------------------------
 *  Shared sidebar pieces
 *  ---------------------------------------------------------------- */

export function MovaLogo({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--text)" />
            <path d="M5 16V8l7 6 7-6v8" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function Brand() {
    return (
        <Link className="brand" to="/dashboard">
            <MovaLogo />
            <span className="name">Mova</span>
        </Link>
    );
}

function NavLinks() {
    const render = (item: NavItem & { muted?: boolean }) => (
        <NavLink
            key={item.label}
            to={item.to}
            end={item.to === "/dashboard"}
            onMouseDown={onClose} // close the mobile drawer when navigating
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""} ${item.muted ? "nav-muted" : ""}`}
        >
            <span className="ico">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
        </NavLink>
    );

    return (
        <nav aria-label="Main">
            <span className="nav-group-label">Menu</span>
            {MENU.map(render)}
            <span className="nav-group-label">Manage</span>
            {MANAGE.map(render)}
        </nav>
    );
}

/* ----------------------------------------------------------------
 *  Sidebar account menu (Vercel-style) — pinned to the bottom-left,
 *  opens upward with account details, theme, links and logout.
 *  ---------------------------------------------------------------- */
const THEME_OPTIONS: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
];

function SidebarUserMenu() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { theme, setTheme } = useTheme();
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    const fullName = user?.kycProfile?.fullName?.trim() || user?.username || "Mova User";
    const email = user?.email || "";
    const walletId = user?.wallet?.walletId || "";
    const initials = fullName
        .split(/\s+/)
        .map((part) => part[0] ?? "")
        .slice(0, 2)
        .join("")
        .toUpperCase();

    React.useEffect(() => {
        if (!open) return;

        const onPointerDown = (e: MouseEvent | TouchEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const handleLogout = async () => {
        setOpen(false);
        await logout();
        navigate("/login", { replace: true });
    };

    return (
        <div className="sb-user-wrap" ref={ref}>
            <button
                type="button"
                className="sb-user-btn"
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                <span className="avatar" aria-hidden="true">
                    {initials || "U"}
                </span>
                <span className="sb-user-meta">
                    <span className="sb-user-name">{fullName}</span>
                    <span className="sb-user-wallet">{walletId ? `ID · ${walletId}` : "No wallet yet"}</span>
                </span>
                <ChevronUp className="sb-user-chevron" aria-hidden="true" />
            </button>

            {open && (
                <div className="um-popover sb-popover" role="menu" aria-label="Account menu">
                    <div className="um-header">
                        <span className="avatar" aria-hidden="true">
                            {initials || "U"}
                        </span>
                        <div className="min-w-0">
                            <div className="um-header-name">{fullName}</div>
                            <div className="um-header-email">{email || "No email set"}</div>
                        </div>
                    </div>

                    <div className="um-sep" />

                    <Link to="/dashboard" className="um-item" role="menuitem" onClick={() => setOpen(false)}>
                        <LayoutGrid aria-hidden="true" />
                        Overview
                    </Link>
                    <Link to="/dashboard/settings" className="um-item" role="menuitem" onClick={() => setOpen(false)}>
                        <Settings aria-hidden="true" />
                        Settings
                    </Link>

                    <div className="um-sep" />

                    <div className="um-label">Appearance</div>
                    {THEME_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            role="menuitem"
                            aria-selected={theme === opt.value}
                            className={`um-item ${theme === opt.value ? "um-item-active" : ""}`}
                            onClick={() => setTheme(opt.value)}
                        >
                            <svg className="um-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                            {opt.label}
                        </button>
                    ))}

                    <div className="um-sep" />

                    <a href="/#faq" className="um-item" role="menuitem" onClick={() => setOpen(false)}>
                        <HelpCircle aria-hidden="true" />
                        Help & FAQ
                    </a>

                    <div className="um-sep" />

                    <button type="button" className="um-item um-item-danger" role="menuitem" onClick={handleLogout}>
                        <LogOut aria-hidden="true" />
                        Log out
                    </button>
                </div>
            )}
        </div>
    );
}

/* ----------------------------------------------------------------
 *  Desktop sidebar (collapsible)
 *  ---------------------------------------------------------------- */
export function DesktopSidebar() {
    const [collapsed, setCollapsed] = React.useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return localStorage.getItem("mova-sidebar") === "collapsed";
    });

    const toggle = () => {
        setCollapsed((v) => {
            const next = !v;
            localStorage.setItem("mova-sidebar", next ? "collapsed" : "expanded");
            return next;
        });
    };

    return (
        <aside className={`sidebar desktop-only ${collapsed ? "collapsed" : ""}`} id="sidebar">
            <div className="sidebar-header">
                <Brand />
                <button className="tside-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggle}>
                    <ChevronsLeft className="h-4 w-4" />
                </button>
            </div>

            <div className="sidebar-search">
                <input className="input" placeholder="Search" type="search" aria-label="Search" />
            </div>

            <NavLinks />

            <SidebarUserMenu />
        </aside>
    );
}

/* ----------------------------------------------------------------
 *  Mobile off-canvas sidebar (internal state + event listeners)
 *  ---------------------------------------------------------------- */
export function MobileSidebar() {
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        const openH = () => setOpen(true);
        const closeH = () => setOpen(false);
        const toggleH = () => setOpen((v) => !v);

        document.addEventListener(OPEN_EVT, openH);
        document.addEventListener(CLOSE_EVT, closeH);
        document.addEventListener(TOGGLE_EVT, toggleH);

        return () => {
            document.removeEventListener(OPEN_EVT, openH);
            document.removeEventListener(CLOSE_EVT, closeH);
            document.removeEventListener(TOGGLE_EVT, toggleH);
        };
    }, []);

    // Reflect the drawer state on <html> so CSS can hide the topbar burger and
    // lock body scroll while the drawer is open (applies on every dashboard page).
    React.useEffect(() => {
        const root = document.documentElement;
        if (open) {
            root.dataset.drawerOpen = "true";
        } else {
            delete root.dataset.drawerOpen;
        }
        return () => {
            delete root.dataset.drawerOpen;
        };
    }, [open]);

    return (
        <>
            <div className={`sb-overlay ${open ? "open" : ""}`} onClick={onClose} aria-hidden />
            <aside className={`sidebar mobile-only ${open ? "mobile-open" : ""}`}>
                <div className="sidebar-header">
                    <Brand />
                    <button className="tside-toggle" aria-label="Close menu" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <NavLinks />

                <SidebarUserMenu />
            </aside>
        </>
    );

    function onClose() {
        setOpen(false);
    }
}
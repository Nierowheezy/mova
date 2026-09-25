// src/layout/Header.tsx — Mova landing navigation
// Shared by the landing page and the auth pages (Login/Signup).
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { MovaLogo } from "./Sidebar";

const NAV_ITEMS = [
    { label: "How it works", to: "#how" },
    { label: "Features", to: "#features" },
    { label: "FAQ", to: "#faq" },
];

export default function Header() {
    const { isLoggedIn, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate("/login");
    };

    return (
        <nav className="nav-landing">
            <div className="nav-landing-inner">
                <Link to="/" className="flex items-center gap-2" style={{ textDecoration: "none" }}>
                    <MovaLogo size={26} />
                    <span style={{ fontSize: "1.125rem", fontWeight: 600, letterSpacing: "-0.03em", color: "var(--text)" }}>Mova</span>
                </Link>

                <ul className="nav-links hide-mobile">
                    {NAV_ITEMS.map((item) => (
                        <li key={item.label}>
                            <a href={item.to}>{item.label}</a>
                        </li>
                    ))}
                </ul>

                <div className="nav-cta-row">
                    <ThemeToggleButton />
                    {isLoggedIn ? (
                        <button type="button" onClick={handleLogout} className="btn btn-ghost btn-sm">
                            Log out
                        </button>
                    ) : (
                        <Link to="/login" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>
                            Sign in
                        </Link>
                    )}
                    <Link to="/signup" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>
                        Get Started
                    </Link>
                </div>
            </div>
        </nav>
    );
}
import React, { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getApiErrorMessage } from "@/libs/errors";
import { validateEmail, validatePassword } from "@/libs/validation";
import FieldError from "@/components/ui/FieldError";

const Login: React.FC = () => {
    const { login, loading, isLoggedIn } = useAuth();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const redirect = searchParams.get("redirect") || "/dashboard";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [blurred, setBlurred] = useState({ email: false, password: false });

    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // Debounced copies power the live (while-typing) checks; blur covers required.
    const liveEmail = useDebouncedValue(email.trim(), 500);
    const emailIssue = validateEmail(email);
    const passwordIssue = validatePassword(password, true, 1); // login only enforces "required"

    const showEmailErr = !!(emailIssue && (blurred.email || liveEmail.length > 0));
    const showPassErr = !!(passwordIssue && blurred.password);

    useEffect(() => {
        if (!loading && isLoggedIn) {
            navigate(redirect, { replace: true });
        }
    }, [loading, isLoggedIn, navigate, redirect]);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setErr(null);

        setBlurred({ email: true, password: true });
        if (emailIssue || passwordIssue) {
            setErr(emailIssue || passwordIssue);
            return;
        }

        try {
            setSubmitting(true);
            await login({ email, password });
            navigate(redirect, { replace: true });
        } catch (error) {
            if ((error as { twoFactorRequired?: boolean } | null)?.twoFactorRequired)
                setErr("Two-factor authentication required");
            else setErr(getApiErrorMessage(error, "Email or password is incorrect"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ display: "flex", minHeight: "100vh", flexWrap: "wrap" }}>
            {/* ============ Brand panel ============ */}
            <div
                style={{
                    flex: "1 1 440px",
                    background: "#111113",
                    color: "#fff",
                    padding: "var(--sp-10)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "var(--sp-12)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="1" y="1" width="22" height="22" rx="6" fill="#09090b" />
                        <path d="M5 16V8l7 6 7-6v8" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: "1.125rem", fontWeight: 600, letterSpacing: "-0.03em", color: "#fff" }}>Mova</span>
                </div>

                <div style={{ maxWidth: "22rem" }}>
                    <p
                        style={{
                            fontSize: "clamp(1.75rem, 2.4vw, 2.25rem)",
                            fontWeight: 600,
                            letterSpacing: "-0.03em",
                            lineHeight: 1.15,
                            color: "#fff",
                        }}
                    >
                        Your money, moving at the speed of now.
                    </p>
                    <div style={{ marginTop: "var(--sp-8)" }}>
                        <div
                            className="mono xsmall"
                            style={{ color: "#9a9ba6", textTransform: "uppercase", letterSpacing: "0.06em" }}
                        >
                            Total balance
                        </div>
                        <div
                            className="money"
                            style={{ marginTop: "var(--sp-1)", fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.03em", color: "#fff" }}
                        >
                            $82,450.13
                        </div>
                    </div>
                </div>

                <div className="mono xsmall" style={{ color: "#6a6a76" }}>
                    Deposits safeguarded with licensed partners
                </div>
            </div>

            {/* ============ Sign in ============ */}
            <div
                style={{
                    flex: "1 1 480px",
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    padding: "var(--sp-6) var(--sp-8) var(--sp-8)",
                }}
            >
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <ThemeToggleButton />
                </div>

                <div style={{ width: "100%", maxWidth: "24rem", margin: "auto" }}>
                    <h1 style={{ fontSize: "clamp(1.6rem, 2.2vw, 2rem)", letterSpacing: "-0.03em" }}>Welcome back</h1>
                    <p className="subdued" style={{ marginTop: "var(--sp-2)" }}>
                        Sign in to your Mova account.
                    </p>

                    <form
                        onSubmit={onSubmit}
                        noValidate
                        style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)", marginTop: "var(--sp-8)" }}
                    >
                        <div className="field">
                            <label className="label" htmlFor="login-email">
                                Email
                            </label>
                            <input
                                id="login-email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onBlur={() => setBlurred((b) => ({ ...b, email: true }))}
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                aria-invalid={showEmailErr}
                                className={`input ${showEmailErr ? "input-error" : ""}`}
                            />
                            <FieldError message={showEmailErr ? emailIssue : undefined} />
                        </div>

                        <div className="field">
                            <label className="label" htmlFor="login-password">
                                Password
                            </label>
                            <input
                                id="login-password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setErr(null);
                                }}
                                onBlur={() => setBlurred((b) => ({ ...b, password: true }))}
                                type="password"
                                autoComplete="current-password"
                                placeholder="••••••••"
                                aria-invalid={showPassErr || !!err}
                                className={`input ${showPassErr || err ? "input-error" : ""}`}
                            />
                            {showPassErr ? (
                                <FieldError message={passwordIssue} />
                            ) : err ? (
                                <span className="error-text" role="alert">
                                    {err}
                                </span>
                            ) : null}
                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <a className="small" href="#" onClick={(e) => e.preventDefault()}>
                                    Forgot password?
                                </a>
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
                            {submitting ? "Signing in..." : "Sign in"}
                        </button>
                    </form>

                    <hr className="hairline" style={{ margin: "var(--sp-6) 0" }} />
                    <p className="small subdued" style={{ textAlign: "center" }}>
                        New to Mova?{" "}
                        <Link
                            to="/signup"
                            style={{ color: "var(--text)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: "0.14em" }}
                        >
                            Create an account
                        </Link>
                    </p>
                </div>

                <div className="small mono faint" style={{ textAlign: "center" }}>
                    Protected by bank-grade encryption · PCI-DSS
                </div>
            </div>
        </div>
    );
};

export default Login;
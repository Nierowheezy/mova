import React, { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getApiErrorMessage } from "@/libs/errors";
import { validateEmail, validatePassword, validateConfirm } from "@/libs/validation";
import FieldError from "@/components/ui/FieldError";

const Signup: React.FC = () => {
    const { register, loading, isLoggedIn } = useAuth();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const redirect = searchParams.get("redirect") || "/";

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [blurred, setBlurred] = useState({ name: false, email: false, password: false, confirm: false });

    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // Debounced copies drive live checks while typing; blur covers "required".
    const liveEmail = useDebouncedValue(email.trim(), 500);
    const liveConfirm = useDebouncedValue(confirm.trim(), 500);
    const nameIssue = name.trim() ? "" : "Full name is required";
    const emailIssue = validateEmail(email);
    const passwordIssue = validatePassword(password);
    const confirmIssue = password ? validateConfirm(confirm, password, "Passwords") : "";

    const showNameErr = !!(nameIssue && blurred.name);
    const showEmailErr = !!(emailIssue && (blurred.email || liveEmail.length > 0));
    const showPassErr = !!(passwordIssue && (blurred.password || password.length > 0));
    const showConfirmErr = !!(confirmIssue && (blurred.confirm || liveConfirm.length > 0));

    useEffect(() => {
        if (!loading && isLoggedIn) {
            navigate(redirect, { replace: true });
        }
    }, [loading, isLoggedIn, navigate, redirect]);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setErr(null);

        setBlurred({ name: true, email: true, password: true, confirm: true });
        if (nameIssue || emailIssue || passwordIssue || confirmIssue) {
            setErr(nameIssue || emailIssue || passwordIssue || confirmIssue);
            return;
        }

        try {
            setSubmitting(true);
            await register({ email, password, confirmPassword: confirm, name });
            navigate(redirect, { replace: true });
        } catch (error) {
            setErr(getApiErrorMessage(error, "Could not create account, try a different email"));
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
                        No fees. No branches. Just your money, moving.
                    </p>
                    <div className="mono xsmall" style={{ marginTop: "var(--sp-8)", color: "#9a9ba6" }}>
                        Free transfers · No monthly fees · No minimum
                    </div>
                </div>

                <div className="mono xsmall" style={{ color: "#6a6a76" }}>
                    Bank-grade KYC · 256-bit encryption
                </div>
            </div>

            {/* ============ Create account ============ */}
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
                    <h1 style={{ fontSize: "clamp(1.6rem, 2.2vw, 2rem)", letterSpacing: "-0.03em" }}>Create your account</h1>
                    <p className="subdued" style={{ marginTop: "var(--sp-2)" }}>
                        Open a free account in minutes.
                    </p>

                    <form
                        onSubmit={onSubmit}
                        noValidate
                        style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)", marginTop: "var(--sp-8)" }}
                    >
                        <div className="field">
                            <label className="label" htmlFor="signup-name">
                                Full name
                            </label>
                            <input
                                id="signup-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onBlur={() => setBlurred((b) => ({ ...b, name: true }))}
                                type="text"
                                autoComplete="name"
                                placeholder="Ada Obi"
                                aria-invalid={showNameErr}
                                className={`input ${showNameErr ? "input-error" : ""}`}
                            />
                            <FieldError message={showNameErr ? nameIssue : undefined} />
                        </div>

                        <div className="field">
                            <label className="label" htmlFor="signup-email">
                                Email
                            </label>
                            <input
                                id="signup-email"
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
                            <label className="label" htmlFor="signup-password">
                                Password
                            </label>
                            <input
                                id="signup-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onBlur={() => setBlurred((b) => ({ ...b, password: true }))}
                                type="password"
                                autoComplete="new-password"
                                placeholder="Create a password"
                                aria-invalid={showPassErr}
                                className={`input ${showPassErr ? "input-error" : ""}`}
                            />
                            <FieldError message={showPassErr ? passwordIssue : undefined} />
                        </div>

                        <div className="field">
                            <label className="label" htmlFor="signup-confirm">
                                Confirm password
                            </label>
                            <input
                                id="signup-confirm"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                onBlur={() => setBlurred((b) => ({ ...b, confirm: true }))}
                                type="password"
                                autoComplete="new-password"
                                placeholder="Repeat your password"
                                aria-invalid={showConfirmErr || !!err}
                                className={`input ${showConfirmErr || err ? "input-error" : ""}`}
                            />
                            {showConfirmErr ? (
                                <FieldError message={confirmIssue} />
                            ) : err ? (
                                <span className="error-text" role="alert">
                                    {err}
                                </span>
                            ) : null}
                        </div>

                        <p className="small subdued">You'll verify your identity in the next step.</p>

                        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
                            {submitting ? "Creating..." : "Create account"}
                        </button>
                    </form>

                    <hr className="hairline" style={{ margin: "var(--sp-6) 0" }} />
                    <p className="small subdued" style={{ textAlign: "center" }}>
                        Already have an account?{" "}
                        <Link
                            to="/login"
                            style={{ color: "var(--text)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: "0.14em" }}
                        >
                            Sign in
                        </Link>
                    </p>
                </div>

                <div className="small mono faint" style={{ textAlign: "center" }}>
                    By signing up you agree to our Terms &amp; Privacy Policy
                </div>
            </div>
        </div>
    );
};

export default Signup;
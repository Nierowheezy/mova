import React, { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/layout/Header";
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

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [blurred, setBlurred] = useState({ email: false, password: false, confirm: false });

    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // Debounced copies drive live checks while typing; blur covers "required".
    const liveEmail = useDebouncedValue(email.trim(), 500);
    const liveConfirm = useDebouncedValue(confirm.trim(), 500);
    const emailIssue = validateEmail(email);
    const passwordIssue = validatePassword(password);
    const confirmIssue = password ? validateConfirm(confirm, password, "Passwords") : "";

    const showEmailErr = !!(emailIssue && (blurred.email || liveEmail.length > 0));
    const showPassErr = !!(passwordIssue && (blurred.password || password.length > 0));
    const showConfirmErr = !!(confirmIssue && (blurred.confirm || liveConfirm.length > 0));

    useEffect(() => {
        if (!loading && isLoggedIn) {
            navigate(redirect, { replace: true });
        }
    }, [loading, isLoggedIn, navigate, redirect]);

    const inputClass = (invalid: boolean) =>
        `w-full rounded-xl border bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 outline-none ring-0 transition focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-gray-200 dark:bg-black/40 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-black/30 dark:focus-visible:ring-white/10 ${
            invalid
                ? "border-red-400 dark:border-red-500/60"
                : "border-gray-300 dark:border-white/10"
        }`;

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setErr(null);

        setBlurred({ email: true, password: true, confirm: true });
        if (emailIssue || passwordIssue || confirmIssue) {
            setErr(emailIssue || passwordIssue || confirmIssue);
            return;
        }

        try {
            setSubmitting(true);
            await register({ email, password, confirmPassword: confirm });
            navigate(redirect, { replace: true });
        } catch (error) {
            setErr(getApiErrorMessage(error, "Could not create account, try a different email"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Header />

            <main className="relative grid min-h-screen place-items-center overflow-hidden bg-white p-4 text-gray-900 dark:bg-gradient-to-b dark:from-black dark:via-neutral-950 dark:to-black dark:text-white">
                {/* ambient glow (dark mode only) */}
                <div className="pointer-events-none absolute inset-0 hidden dark:block">
                    <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
                    <div className="absolute bottom-0 left-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
                    <div className="absolute -bottom-24 right-1/4 h-64 w-64 translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
                </div>

                <div className="w-full max-w-md">
                    {/* Header */}
                    <div className="mb-6 text-center">
                        <div className="mx-auto mb-3 h-11 w-11 rounded-2xl bg-white ring-1 ring-gray-200 shadow-sm dark:bg-white/10 dark:ring-white/15 dark:backdrop-blur">
                            <div className="grid h-full w-full place-items-center">
                                <span className="block h-2 w-2 rounded-full bg-gray-900 dark:bg-white/85" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">Join and get moving fast.</p>
                    </div>

                    {/* Card */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-md">
                        {err && <div className=" mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{err}</div>}

                        <form onSubmit={onSubmit} className="space-y-4" noValidate>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300" htmlFor="signup-email">
                                    Email
                                </label>
                                <input
                                    id="signup-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onBlur={() => setBlurred((b) => ({ ...b, email: true }))}
                                    autoComplete="email"
                                    placeholder="you@example.com"
                                    aria-invalid={showEmailErr}
                                    className={inputClass(showEmailErr)}
                                />
                                <FieldError message={showEmailErr ? emailIssue : undefined} />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300" htmlFor="signup-password">
                                    Password
                                </label>
                                <input
                                    id="signup-password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onBlur={() => setBlurred((b) => ({ ...b, password: true }))}
                                    autoComplete="new-password"
                                    placeholder="At least 8 characters"
                                    aria-invalid={showPassErr}
                                    className={inputClass(showPassErr)}
                                />
                                <FieldError message={showPassErr ? passwordIssue : undefined} />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300" htmlFor="signup-confirm">
                                    Confirm password
                                </label>
                                <input
                                    id="signup-confirm"
                                    type="password"
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    onBlur={() => setBlurred((b) => ({ ...b, confirm: true }))}
                                    autoComplete="new-password"
                                    placeholder="Repeat your password"
                                    aria-invalid={showConfirmErr}
                                    className={inputClass(showConfirmErr)}
                                />
                                <FieldError message={showConfirmErr ? confirmIssue : undefined} />
                            </div>

                            <button type="submit" disabled={submitting} className="group relative w-full overflow-hidden rounded-xl bg-gray-900 px-4 py-2.5 text-white transition hover:opacity-95 dark:bg-white dark:text-black">
                                <span className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-white via-neutral-200 to-white opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100 dark:block" />
                                {submitting ? "Creating..." : "Create account"}
                            </button>
                        </form>

                        <p className="mt-6 text-center text-sm text-gray-500 dark:text-neutral-400">
                            Already have an account?{" "}
                            <Link to="/login" className="font-medium text-blue-600 underline underline-offset-4 hover:underline dark:text-white/90 dark:hover:text-white">
                                Sign in
                            </Link>
                        </p>
                    </div>

                    <p className="mt-6 text-center text-xs text-gray-400 dark:text-neutral-500">One account. Session refresh via secure cookies.</p>
                </div>
            </main>
        </>
    );
};

export default Signup;
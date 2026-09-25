import React, { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/layout/Header";
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

    const inputClass = (invalid: boolean) =>
        `w-full rounded-xl border bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 outline-none ring-0 transition focus:border-gray-400 focus-visible:ring-2 focus-visible:ring-gray-200 dark:bg-black/40 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-black/30 dark:focus-visible:ring-white/10 ${
            invalid
                ? "border-red-400 dark:border-red-500/60"
                : "border-gray-300 dark:border-white/10"
        }`;

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
            else setErr(getApiErrorMessage(error, "Email or password is wrong"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Header />

            <main className="relative grid min-h-screen place-items-center overflow-hidden bg-white p-4 text-gray-900 dark:bg-gradient-to-b dark:from-black dark:via-neutral-950 dark:to-black dark:text-white">
                {/* dark-mode ambient glows only */}
                <div className="pointer-events-none absolute inset-0 hidden dark:block">
                    <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
                    <div className="absolute bottom-0 left-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
                    <div className="absolute -bottom-24 right-1/4 h-64 w-64 translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
                </div>

                <div className="w-full max-w-md">
                    <div className="mb-6 text-center">
                        <div className="mx-auto mb-3 h-11 w-11 rounded-2xl bg-white ring-1 ring-gray-200 shadow-sm dark:bg-white/10 dark:ring-white/15 dark:backdrop-blur">
                            <div className="grid h-full w-full place-items-center">
                                <span className="block h-2 w-2 rounded-full bg-gray-900 dark:bg-white/85" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">Sign in to continue.</p>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-md">
                        {err && <div className=" mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{err}</div>}

                        <form onSubmit={onSubmit} className="space-y-4" noValidate>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300" htmlFor="login-email">
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
                                    className={inputClass(showEmailErr)}
                                />
                                <FieldError message={showEmailErr ? emailIssue : undefined} />
                            </div>

                            <div>
                                <div className="mb-1 flex items-center justify-between">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300" htmlFor="login-password">
                                        Password
                                    </label>
                                </div>
                                <input
                                    id="login-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onBlur={() => setBlurred((b) => ({ ...b, password: true }))}
                                    type="password"
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    aria-invalid={showPassErr}
                                    className={`${inputClass(showPassErr)} pr-10`}
                                />
                                <FieldError message={showPassErr ? passwordIssue : undefined} />
                            </div>

                            <button type="submit" className="group relative w-full overflow-hidden rounded-xl bg-gray-900 px-4 py-2.5 text-white transition hover:opacity-95 dark:bg-white dark:text-black">
                                <span className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-white via-neutral-200 to-white opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100 dark:block" />
                                {submitting ? "Signin..." : "Sign In"}
                            </button>
                        </form>

                        <p className="mt-6 text-center text-sm text-gray-500 dark:text-neutral-400">
                            No account?{" "}
                            <Link to="/signup" className="font-medium text-blue-600 underline underline-offset-4 hover:underline dark:text-white/90 dark:hover:text-white">
                                Create one
                            </Link>
                        </p>
                    </div>

                    <p className="mt-6 text-center text-xs text-gray-400 dark:text-neutral-500">Protected by session refresh. Cookies must be enabled.</p>
                </div>
            </main>
        </>
    );
};

export default Login;
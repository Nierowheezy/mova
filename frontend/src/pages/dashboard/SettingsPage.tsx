// src/pages/dashboard/SettingsPage.tsx
// Account settings: profile, wallet, KYC status and the transaction PIN.
// The PIN form uses debounced + on-blur validation so mistakes surface
// without spamming errors on every keystroke.
import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, KeyRound, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { DesktopSidebar, MobileSidebar } from "@/layout/Sidebar";
import DashboardHeader from "@/layout/DashboardHeader";
import { useAuth } from "@/hooks/useAuth";
import { setTransactionPin } from "@/libs/core";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { validatePin, validateConfirm } from "@/libs/validation";
import FieldError from "@/components/ui/FieldError";

const kycStatus = (status: string | undefined): { label: string; className: string } => {
    switch ((status ?? "UNVERIFIED").toUpperCase()) {
        case "VERIFIED":
            return { label: "Verified", className: "badge-success" };
        case "PENDING":
            return { label: "Pending Review", className: "badge-warning" };
        case "REJECTED":
            return { label: "Rejected", className: "badge-danger" };
        default:
            return { label: "Unverified", className: "badge-neutral" };
    }
};

const formatDate = (iso?: string) => {
    if (!iso) return "—";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

function PinCard() {
    const [pin, setPin] = React.useState("");
    const [confirm, setConfirm] = React.useState("");
    const [blurred, setBlurred] = React.useState<{ pin: boolean; confirm: boolean }>({ pin: false, confirm: false });

    // Debounced copies used for live (while-typing) validation.
    const livePin = useDebouncedValue(pin.trim(), 500);
    const liveConfirm = useDebouncedValue(confirm.trim(), 500);

    const pinIssue = validatePin(pin);
    const confirmIssue = pin ? validateConfirm(confirm, pin, "PINS") : "";

    const showPinErr = !!(pinIssue && (blurred.pin || livePin.length > 0));
    const showConfirmErr = !!(confirmIssue && (blurred.confirm || (liveConfirm.length > 0 && pin)));

    const { run: savePin, pending: saving, error: apiError } = useAsyncAction(
        async (value: string) => {
            const { data } = await setTransactionPin({ pin: value });
            return data;
        },
        { successMessage: "Transaction PIN updated", showSuccessToast: true, errorMessage: "Couldn't update PIN" },
    );

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pinIssue || confirmIssue) {
            setBlurred({ pin: true, confirm: true });
            toast.warning("Fix the PIN fields first");
            return;
        }
        await savePin(pin.trim());
        setPin("");
        setConfirm("");
        setBlurred({ pin: false, confirm: false });
    };

    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-black/40">
                    <KeyRound className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-base font-semibold">Transaction PIN</h2>
                    <p className="text-sm text-gray-600 dark:text-white/60">The 4-digit PIN you enter when sending money. Kept secure on our side - never stored in plain text.</p>
                </div>
            </div>

            {apiError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{apiError}</div>
            )}

            <form className="mt-5 space-y-4" onSubmit={handleSave} noValidate>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="field">
                        <label className="label" htmlFor="settings-pin">
                            New PIN
                        </label>
                        <input
                            id="settings-pin"
                            type="password"
                            inputMode="numeric"
                            autoComplete="new-password"
                            maxLength={4}
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                            onBlur={() => setBlurred((b) => ({ ...b, pin: true }))}
                            aria-invalid={showPinErr}
                            placeholder="••••"
                            className={`input ${showPinErr ? "input-error" : ""}`}
                        />
                        <FieldError message={showPinErr ? pinIssue : undefined} />
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="settings-pin-confirm">
                            Confirm PIN
                        </label>
                        <input
                            id="settings-pin-confirm"
                            type="password"
                            inputMode="numeric"
                            autoComplete="new-password"
                            maxLength={4}
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
                            onBlur={() => setBlurred((b) => ({ ...b, confirm: true }))}
                            aria-invalid={showConfirmErr}
                            placeholder="••••"
                            className={`input ${showConfirmErr ? "input-error" : ""}`}
                        />
                        <FieldError message={showConfirmErr ? confirmIssue : undefined} />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                    <span className="hint">Only digits - exactly 4.</span>
                    <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                        {saving ? "Saving..." : "Update PIN"}
                    </button>
                </div>
            </form>
        </section>
    );
}

const SettingsPage: React.FC = () => {
    const { user } = useAuth();
    const [copied, setCopied] = React.useState(false);

    const fullName = user?.kycProfile?.fullName?.trim() || user?.username || "Mova User";
    const email = user?.email || "";
    const initials = fullName
        .split(/\s+/)
        .map((part) => part[0] ?? "")
        .slice(0, 2)
        .join("")
        .toUpperCase();
    const walletId = user?.wallet?.walletId || "";
    const balance = Number(user?.wallet?.balance ?? 0);
    const status = kycStatus(user?.kycProfile?.verificationStatus);

    const copyWallet = async () => {
        if (!walletId) return;
        try {
            await navigator.clipboard.writeText(walletId);
            setCopied(true);
            toast.success("Wallet ID copied");
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            toast.error("Couldn't copy, copy it manually");
        }
    };

    return (
        <div className="min-h-screen bg-white text-gray-900 antialiased dark:bg-[#0a0a0a] dark:text-white">
            <div className="flex">
                <DesktopSidebar />
                <MobileSidebar />

                <main className="min-h-screen flex-1">
                    <DashboardHeader />

                    <div className="mx-auto flex max-w-7xl items-center justify-between px-4 pt-6 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-2">
                            <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white">
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </Link>
                            <div className="hidden text-sm text-gray-500 dark:text-white/60 sm:block">/ Dashboard / Settings</div>
                        </div>
                    </div>

                    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
                        <div className="mb-6">
                            <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
                            <p className="mt-1 text-sm text-gray-600 dark:text-white/60">Manage your profile, wallet and security preferences.</p>
                        </div>

                        <div className="space-y-6">
                            {/* Profile */}
                            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                    <span className="avatar avatar-lg" aria-hidden="true">
                                        {initials || "U"}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-base font-semibold leading-tight">{fullName}</h2>
                                        <p className="truncate text-sm text-gray-600 dark:text-white/60">{email}</p>
                                        <p className="mt-0.5 text-xs text-gray-400 dark:text-neutral-500">Member since {formatDate(user?.createdAt)}</p>
                                    </div>
                                    <Link to="/dashboard/kyc" className="btn btn-secondary btn-sm">
                                        Manage identity
                                    </Link>
                                </div>
                            </section>

                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                {/* Wallet */}
                                <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
                                    <div className="flex items-start gap-3">
                                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-black/40">
                                            <WalletIcon className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h2 className="text-base font-semibold">Wallet</h2>
                                            <p className="text-sm text-gray-600 dark:text-white/60">Your account ID and live balance.</p>
                                        </div>
                                    </div>

                                    <dl className="mt-5 space-y-4 text-sm">
                                        <div className="flex items-center justify-between gap-3">
                                            <dt className="text-gray-500 dark:text-neutral-400">Wallet ID</dt>
                                            <dd className="flex items-center gap-2">
                                                <span className="font-mono text-xs sm:text-sm">{walletId || "—"}</span>
                                                {walletId && (
                                                    <button type="button" onClick={copyWallet} aria-label="Copy wallet ID" className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:text-gray-900 dark:border-white/10 dark:bg-transparent dark:text-white/50 dark:hover:text-white">
                                                        {copied ? <span className="text-emerald-500">✓</span> : <Copy className="h-3.5 w-3.5" />}
                                                    </button>
                                                )}
                                            </dd>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <dt className="text-gray-500 dark:text-neutral-400">Balance</dt>
                                            <dd className="font-semibold">${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
                                        </div>
                                    </dl>

                                    <div className="mt-5 flex gap-2">
                                        <Link to="/dashboard/fund" className="btn btn-primary btn-sm">
                                            Fund wallet
                                        </Link>
                                        <Link to="/dashboard/withdraw" className="btn btn-secondary btn-sm">
                                            Withdraw
                                        </Link>
                                    </div>
                                </section>

                                {/* KYC */}
                                <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
                                    <div className="flex items-start gap-3">
                                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-black/40">
                                            <ShieldCheck className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h2 className="text-base font-semibold">Identity verification</h2>
                                            <p className="text-sm text-gray-600 dark:text-white/60">KYC status for sending money.</p>
                                        </div>
                                    </div>

                                    <div className="mt-5 flex items-center gap-2">
                                        <span className={`badge ${status.className}`}>
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                                            {status.label}
                                        </span>
                                        {status.label === "Verified" && <span className="text-xs text-gray-400 dark:text-neutral-500">Transfers enabled</span>}
                                    </div>
                                    <p className="mt-3 text-sm text-gray-600 dark:text-white/60">Verification is required before you can send money to other wallets.</p>

                                    <div className="mt-5">
                                        <Link to="/dashboard/kyc" className="btn btn-secondary btn-sm">
                                            {status.label === "Verified" ? "View KYC details" : "Complete verification"}
                                        </Link>
                                    </div>
                                </section>
                            </div>

                            {/* PIN */}
                            <PinCard />
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default SettingsPage;
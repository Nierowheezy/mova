// src/pages/dashboard/wallet/WithdrawWallet.tsx
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Landmark } from "lucide-react";
import { DesktopSidebar, MobileSidebar } from "@/layout/Sidebar";
import DashboardHeader from "@/layout/DashboardHeader";
import { withdrawFromWallet, newIdempotencyKey } from "@/libs/core";
import { useAuth } from "@/hooks/useAuth";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { validateAmount } from "@/libs/validation";
import FieldError from "@/components/ui/FieldError";

function WithdrawForm() {
    const { user } = useAuth();
    const [amount, setAmount] = useState<string>("");
    const [localError, setLocalError] = useState(""); // client-side validation only
    const [successMsg, setSuccessMsg] = useState("");
    const [blurredAmount, setBlurredAmount] = useState(false);

    // One stable idempotency key per withdrawal intent so a retry of the same
    // request can never double-payout (the backend replays the original key's
    // result). Rotated when the amount changes or a withdrawal succeeds.
    const idemKeyRef = React.useRef<string | null>(null);
    const intentKey = () => {
        if (!idemKeyRef.current) idemKeyRef.current = newIdempotencyKey();
        return idemKeyRef.current;
    };
    React.useEffect(() => {
        idemKeyRef.current = null;
    }, [amount]);

    const availableBalance = Number(user?.wallet?.balance ?? 0);

    // Debounced copy powers the live amount check; blur covers the empty case.
    const liveAmount = useDebouncedValue(amount.trim(), 500);
    const amountIssue = validateAmount(amount, { max: availableBalance, label: "Amount" });
    const showAmountErr = !!(amountIssue && (blurredAmount || liveAmount.length > 0));

    const { run: executeWithdraw, pending: submitting, error: apiError } = useAsyncAction(
        async (parsedAmount: number) => {
            const { data } = await withdrawFromWallet({
                amount: parsedAmount,
                idempotencyKey: intentKey(),
            });
            return data;
        },
        { successMessage: "Withdrawal initiated", showSuccessToast: true, errorMessage: "Withdrawal failed, please try again later" },
    );

    const errorMsg = apiError ?? localError;

    async function handleWithdraw() {
        setLocalError("");
        setSuccessMsg("");

        const parsedAmount = parseFloat(amount);
        if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            setBlurredAmount(true);
            setLocalError("Enter a valid amount");
            return;
        }
        if (parsedAmount > availableBalance) {
            setLocalError("Insufficient funds");
            return;
        }

        const result = await executeWithdraw(parsedAmount);
        if (result) {
            setSuccessMsg(result?.message || "Withdrawal initiated");
            setAmount("");
        }
    }

    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="mb-5">
                <h1 className="text-lg font-semibold">Withdraw from Wallet</h1>
                <p className="text-sm text-gray-600 dark:text-white/60">
                    Available balance: ${availableBalance.toFixed(2)}
                </p>
            </div>

            {errorMsg && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {errorMsg}
                </div>
            )}
            {successMsg && (
                <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                    {successMsg}
                </div>
            )}

            <form className="space-y-6" noValidate onSubmit={(e) => e.preventDefault()}>
                {/* Amount */}
                <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-white/70" htmlFor="withdraw-amount">
                        Amount
                    </label>
                    <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-white/60">$</span>
                        <input
                            id="withdraw-amount"
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            onBlur={() => setBlurredAmount(true)}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            aria-invalid={showAmountErr}
                            className={`w-full rounded-xl border bg-white px-7 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 dark:bg-transparent dark:text-white ${
                                showAmountErr ? "border-red-400 dark:border-red-500/60" : "border-gray-300 dark:border-white/10"
                            }`}
                        />
                    </div>
                    <FieldError message={showAmountErr ? amountIssue : undefined} />
                </div>

                {/* Submit */}
                <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="text-xs text-gray-600 dark:text-white/60">
                        Funds are sent to your linked bank account within 1–3 business days (Stripe payout).
                    </div>
                    <div className="flex gap-2">
                        <Link to="/dashboard" className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5">
                            Cancel
                        </Link>
                        <button
                            type="submit"
                            onClick={handleWithdraw}
                            disabled={submitting}
                            className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50 dark:bg-white dark:text-black"
                        >
                            {submitting ? "Processing..." : "Withdraw"}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

const WithdrawWallet: React.FC = () => {
    return (
        <div className="min-h-screen bg-white text-gray-900 antialiased dark:bg-[#0a0a0a] dark:text-white">
            <div className="flex">
                {/* Desktop sidebar */}
                <DesktopSidebar />
                {/* Mobile off-canvas */}
                <MobileSidebar />

                <main className="min-h-screen flex-1">
                    <DashboardHeader />

                    {/* Breadcrumb */}
                    <div className="mx-auto flex max-w-7xl items-center justify-between px-4 pt-6 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-2">
                            <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white">
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </Link>
                            <div className="hidden text-sm text-gray-500 dark:text-white/60 sm:block">/ Wallet / Withdraw</div>
                        </div>
                    </div>

                    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                            {/* Left: context/tips */}
                            <aside className="lg:col-span-4">
                                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                                    <div className="flex items-center gap-2">
                                        <div className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-black/40">
                                            <Landmark className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold">Withdraw funds</div>
                                            <div className="text-xs text-gray-600 dark:text-white/60">Send money to your bank account.</div>
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-3 text-xs text-gray-600 dark:border-white/10 dark:text-white/60">
                                        <ul className="list-inside list-disc space-y-1">
                                            <li>Enter the amount you want to withdraw.</li>
                                            <li>You’ll need to complete Stripe Connect onboarding first.</li>
                                            <li>Funds arrive in 1–3 business days.</li>
                                        </ul>
                                    </div>
                                </div>
                            </aside>

                            {/* Right: form */}
                            <section className="lg:col-span-8">
                                <WithdrawForm />
                            </section>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default WithdrawWallet;
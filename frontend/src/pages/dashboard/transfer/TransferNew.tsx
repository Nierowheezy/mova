import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, User2, Wallet, Send, Shield, ArrowLeft } from "lucide-react";
import { DesktopSidebar, MobileSidebar } from "@/layout/Sidebar";
import DashboardHeader from "@/layout/DashboardHeader";
import { getBeneficiaries, transferFunds, getWalletDetail } from "@/libs/core";
import { toast } from "sonner";
import { useApiData } from "@/hooks/useApiData";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { validateWalletId, validateAmount, validatePin } from "@/libs/validation";
import FieldError from "@/components/ui/FieldError";

type BeneficiaryItem = {
    id?: string | number;
    name?: string;
    wallet: string;
};

type RawBeneficiaryLike = {
    id?: string | number;
    name?: string;
    wallet_id?: string;
    walletId?: string;
    beneficiary_user?: {
        username?: string;
        email?: string;
        wallet?: { wallet_id?: string };
    };
};

function normalizeBeneficiary(raw: RawBeneficiaryLike | undefined): BeneficiaryItem {
    const name = raw?.name || raw?.beneficiary_user?.username || raw?.beneficiary_user?.email?.split("@")[0] || "Unknown";
    const walletId = raw?.wallet_id || raw?.walletId || raw?.beneficiary_user?.wallet?.wallet_id || "";

    return {
        id: raw?.id ?? `${name}-${walletId}`,
        name,
        wallet: walletId,
    };
}

const TransferNew: React.FC = () => {
    const navigate = useNavigate();

    const { data: beneficiaries, error: beneficiariesError } = useApiData(
        async () => ((await getBeneficiaries()).data ?? []).map(normalizeBeneficiary) as BeneficiaryItem[],
    );

    // Form state
    const [walletId, setWalletId] = React.useState(""); // The wallet ID entered by the user
    const [amount, setAmount] = React.useState(""); // The transfer amount entered by the user
    const [pin, setPin] = React.useState(""); // The transaction pin entered by the user
    const [saveBeneficiary] = React.useState(false); // Whether to save the beneficiary for future transfers
    const [blurred, setBlurred] = React.useState({ walletId: false, amount: false, pin: false });

    // Debounced copies power live field checks; blur covers the "required" case.
    const liveWalletId = useDebouncedValue(walletId.trim(), 500);
    const liveAmount = useDebouncedValue(amount.trim(), 500);
    const livePin = useDebouncedValue(pin.trim(), 500);

    const walletIdIssue = validateWalletId(walletId, true);
    const amountIssue = validateAmount(amount);
    const pinIssue = validatePin(pin);

    const showWalletIdErr = !!(walletIdIssue && (blurred.walletId || liveWalletId.length > 0));
    const showAmountErr = !!(amountIssue && (blurred.amount || liveAmount.length > 0));
    const showPinErr = !!(pinIssue && (blurred.pin || livePin.length > 0));

    const [localError, setLocalError] = React.useState(""); // Client-side validation messages
    const [successMsg, setSuccessMsg] = React.useState(""); // Success message state after a successful transfer

    const fieldCls = (invalid: boolean) =>
        `w-full rounded-xl border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none ring-0 transition focus:border-gray-400 dark:bg-transparent dark:text-white dark:placeholder:text-white/50 ${
            invalid ? "border-red-400 dark:border-red-500/60" : "border-gray-300 dark:border-white/10"
        }`;

    // Verification state
    const [verifiedName, setVerifiedName] = React.useState<string>(""); // Store the name of the wallet owner after verification
    const [verifiedStatus, setVerifiedStatus] = React.useState<string>(""); // Store the verification status
    const [verifyLocal, setVerifyLocal] = React.useState<string>(""); // Client-side verify message

    const { run: verifyWallet, pending: verifying, error: verifyError } = useAsyncAction(
        async (id: string) => {
            const { data } = await getWalletDetail({ wallet_id: id });
            return data;
        },
        { errorMessage: "Could not verify this wallet, double check the ID" },
    );

    const { run: executeTransfer, pending: submitting, error: transferError } = useAsyncAction(
        async (payload: { wallet_id: string; amount: string; transaction_pin: string; save_beneficiary: boolean }) => {
            const { data } = await transferFunds(payload);
            return data;
        },
        { successMessage: "Transfer sent", showSuccessToast: true, errorMessage: "Transfer failed" },
    );

    const errorMsg = transferError ?? localError;
    const verifyErrorMessage = verifyError ?? verifyLocal;

    function handlePickBeneficiary(b: BeneficiaryItem) {
        if (b.wallet) setWalletId(b.wallet);
        toast.success("Beneficiary selected");
    }

    async function handleVerify() {
        setVerifyLocal("");
        setVerifiedName("");
        setVerifiedStatus("");

        const id = walletId.trim();
        if (!id) {
            setVerifyLocal("Enter a wallet ID to verify");
            return;
        }

        const data = await verifyWallet(id);
        if (data) {
            setVerifiedName(data?.full_name ?? "");
            setVerifiedStatus(data?.verification_status);
        }
    }

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        setLocalError("");
        setSuccessMsg("");

        setBlurred({ walletId: true, amount: true, pin: true });
        if (walletIdIssue || amountIssue || pinIssue) {
            setLocalError(walletIdIssue || amountIssue || pinIssue);
            return;
        }

        const data = await executeTransfer({
            wallet_id: walletId?.trim(),
            amount: amount.trim(),
            transaction_pin: pin.trim(),
            save_beneficiary: saveBeneficiary,
        });

        if (data) {
            setSuccessMsg("Transfer sent");
            const ref = data?.reference || data?.transfer_id;
            navigate(ref ? `/dashboard/transactions/${ref}` : "/dashboard/transactions");
        }
    }

    return (
        <div className="min-h-screen bg-white text-gray-900 antialiased dark:bg-[#0a0a0a] dark:text-white">
            <div className="flex">
                {/* Desktop sidebar */}
                <DesktopSidebar />

                {/* Mobile off-canvas */}
                <MobileSidebar />

                <main className="min-h-screen bg-white text-gray-900 dark:bg-[#0a0a0a] dark:text-white">
                    <DashboardHeader />

                    {/* Header row (breadcrumbs/back) */}
                    <div className="mx-auto flex max-w-7xl items-center justify-between px-4 pt-6 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-2">
                            <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white">
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </Link>
                            <div className="hidden text-sm text-gray-500 dark:text-white/60 sm:block">/ Transfers / New</div>
                        </div>
                    </div>

                    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                            {/* ===== Left: Beneficiaries ===== */}
                            <aside className="lg:col-span-4">
                                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-sm font-semibold">Beneficiaries</h2>
                                        <Link to="/dashboard/beneficiaries" className="text-xs text-gray-700 underline-offset-4 hover:underline dark:text-white/80">
                                            Manage
                                        </Link>
                                    </div>

                                    <ul className="divide-y divide-gray-200 dark:divide-white/10">
                                        {(beneficiaries ?? []).map((b) => (
                                            <li key={b.id} className="py-3">
                                                <button onClick={() => handlePickBeneficiary(b)} type="button" className="group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-white/5">
                                                    <span className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-black/40">
                                                        <User2 className="h-5 w-5 text-gray-700 dark:text-white/80" />
                                                    </span>
                                                    <span className="flex-1">
                                                        <span className="block text-sm font-medium">{b.name}</span>
                                                        <span className="block text-xs text-gray-600 dark:text-white/60">{b.wallet}</span>
                                                    </span>
                                                    <span className="hidden rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 shadow-sm group-hover:inline-block dark:border-white/10 dark:bg-transparent dark:text-white">Use</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>

                                    {beneficiariesError ? (
                                        <div className="mt-3 text-xs text-rose-600 dark:text-rose-300">Couldn’t load beneficiaries.</div>
                                    ) : (beneficiaries ?? []).length === 0 ? (
                                        <div className="mt-3 text-xs text-gray-600 dark:text-white/60">No beneficiaries yet — add some from the Manage link above.</div>
                                    ) : null}

                                    <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-3 text-xs text-gray-600 dark:border-white/10 dark:text-white/60">Tip: pick a beneficiary to auto-fill the wallet ID on the right.</div>
                                </div>
                            </aside>

                            {/* ===== Right: Transfer form ===== */}
                            <section className="lg:col-span-8">
                                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
                                    <div className="mb-5 flex items-center justify-between">
                                        <div>
                                            <h1 className="text-lg font-semibold">Send Funds</h1>
                                            <p className="text-sm text-gray-600 dark:text-white/60">Transfer to any wallet in seconds. Fees are shown before you confirm.</p>
                                        </div>
                                        <div className="hidden items-center gap-2 sm:flex">
                                            <span className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-white/10 dark:bg-transparent dark:text-white">
                                                <Shield className="mr-1.5 h-3.5 w-3.5" /> Secure
                                            </span>
                                            <span className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-white/10 dark:bg-transparent dark:text-white">
                                                <Wallet className="mr-1.5 h-3.5 w-3.5" /> Balance-friendly
                                            </span>
                                        </div>
                                    </div>

                                    {errorMsg ? <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{errorMsg}</div> : null}
                                    {successMsg ? <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">{successMsg}</div> : null}

                                    <form onSubmit={handleSend}>
                                        {/* Wallet ID + Verify */}
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            <div className="sm:col-span-2">
                                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-white/70" htmlFor="transfer-wallet">
                                                    Recipient Wallet ID
                                                </label>
                                                <input
                                                    id="transfer-wallet"
                                                    value={walletId}
                                                    onChange={(e) => setWalletId(e.target.value)}
                                                    onBlur={() => setBlurred((b) => ({ ...b, walletId: true }))}
                                                    type="text"
                                                    placeholder="e.g. 8842031169"
                                                    aria-invalid={showWalletIdErr}
                                                    className={fieldCls(showWalletIdErr)}
                                                />
                                                <FieldError message={showWalletIdErr ? walletIdIssue : undefined} />
                                            </div>
                                            <div className="flex items-end">
                                                <button onClick={handleVerify} type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-white dark:text-black sm:w-auto">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    {verifying ? "Verifying" : "Verify"}
                                                </button>
                                            </div>
                                        </div>

                                        {verifyErrorMessage && <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{verifyErrorMessage}</div>}

                                        {!verifyErrorMessage && verifiedName && (
                                            <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                                                <div className="mt-0.5">
                                                    Full name: <span className="font-semibold">{verifiedName}</span>
                                                </div>
                                                <div className="mt-0.5">
                                                    KYC status: <span className="font-semibold">{verifiedStatus}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Amount + PIN */}
                                        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-white/70" htmlFor="transfer-amount">
                                                    Amount
                                                </label>
                                                <div className="relative">
                                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-white/60">$</span>
                                                    <input
                                                        id="transfer-amount"
                                                        value={amount}
                                                        onChange={(e) => setAmount(e.target.value)}
                                                        onBlur={() => setBlurred((b) => ({ ...b, amount: true }))}
                                                        type="number"
                                                        placeholder="0.00"
                                                        aria-invalid={showAmountErr}
                                                        className={`w-full rounded-xl border bg-white px-7 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none ring-0 transition focus:border-gray-400 dark:bg-transparent dark:text-white dark:placeholder:text-white/50 ${
                                                            showAmountErr ? "border-red-400 dark:border-red-500/60" : "border-gray-300 dark:border-white/10"
                                                        }`}
                                                    />
                                                </div>
                                                <FieldError message={showAmountErr ? amountIssue : undefined} />
                                            </div>

                                            <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-white/70" htmlFor="transfer-pin">
                                                    Transaction PIN
                                                </label>
                                                <input
                                                    id="transfer-pin"
                                                    value={pin}
                                                    onChange={(e) => setPin(e.target.value)}
                                                    onBlur={() => setBlurred((b) => ({ ...b, pin: true }))}
                                                    type="password"
                                                    placeholder="••••"
                                                    maxLength={4}
                                                    inputMode="numeric"
                                                    aria-invalid={showPinErr}
                                                    className={`${fieldCls(showPinErr)} tracking-widest`}
                                                />
                                                <FieldError message={showPinErr ? pinIssue : undefined} />
                                            </div>
                                        </div>

                                        {/* Fee + Buttons */}
                                        <div className="mt-5 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                                            <div className="flex gap-2">
                                                <Link to="/dashboard" className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5">
                                                    Cancel
                                                </Link>
                                                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 dark:bg-white dark:text-black">
                                                    <Send className="h-4 w-4" />
                                                    {submitting ? "Sending" : "Send Funds"}
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>

                                {/* Helpful tips / info */}
                                <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 dark:border-white/10 dark:bg-black/40 dark:text-white/60">Transfers to non-beneficiaries may require additional checks. Ensure the wallet ID is correct. Funds sent are final.</div>
                            </section>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default TransferNew;

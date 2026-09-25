// src/pages/dashboard/transactions/TransactionsDetail.tsx
import React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock, XCircle, Wallet as WalletIcon, User2, Hash, Link as LinkIcon, CalendarClock, Shield, Copy } from "lucide-react";
import { DesktopSidebar, MobileSidebar } from "@/layout/Sidebar";
import DashboardHeader from "@/layout/DashboardHeader";
import { getTransaction } from "@/libs/core";
import { useApiData } from "@/hooks/useApiData";
import { PageLoader } from "@/components/ui/PageLoader";
import { ErrorState } from "@/components/ui/ErrorState";
import { toast } from "sonner";

const copyText = async (text: string | undefined | null, label: string) => {
    try {
        if (text) {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied`);
        }
    } catch {
        toast.error("Couldn't copy to clipboard");
    }
};

type Person = { username?: string; email?: string } | null;

type TxDetail = {
    transaction_type?: string;
    reference?: string;
    amount?: number;
    status?: string;
    external_reference?: string | null;
    wallet_id?: string;
    sender?: Person;
    receiver?: Person;
    timestamp?: string;
};

const TransactionDetail: React.FC = () => {
    const { reference } = useParams<{ reference: string }>();
    const { data: tx, loading, error, reload } = useApiData<TxDetail | null>(
        async () => ((await getTransaction(reference ?? "")).data ?? null) as TxDetail | null,
        [reference],
    );

    if (loading) {
        return (
            <div className="grid min-h-screen place-items-center bg-white text-gray-900 dark:bg-[#0a0a0a] dark:text-white">
                <PageLoader label="Loading transaction…" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="grid min-h-screen place-items-center bg-white p-6 text-gray-900 dark:bg-[#0a0a0a] dark:text-white">
                <ErrorState title="Couldn't load this transaction" message={error} onRetry={reload} />
            </div>
        );
    }

    if (!tx) {
        return (
            <div className="grid min-h-screen place-items-center bg-white p-6 text-gray-900 dark:bg-[#0a0a0a] dark:text-white">
                <div className="max-w-sm text-center">
                    <div className="text-lg font-semibold">Transaction not found</div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-white/60">
                        This reference doesn’t exist or you don’t have access to it.
                    </p>
                    <Link to="/dashboard/transactions" className="mt-4 inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-black">
                        Back to Transactions
                    </Link>
                </div>
            </div>
        );
    }

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
                            <Link to="/dashboard/transactions" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white">
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </Link>
                            <div className="hidden text-sm text-gray-500 dark:text-white/60 sm:block">/ Transactions / Detail</div>
                        </div>
                    </div>

                    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                            {/* Left: Summary card */}
                            <section className="lg:col-span-8">
                                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
                                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="grid h-12 w-12 place-items-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-black/40">
                                                <WalletIcon className="h-6 w-6" />
                                            </div>
                                            <div>
                                                <h1 className="text-lg font-semibold">{tx?.transaction_type}</h1>
                                                <div className="mt-0.5 text-sm text-gray-600 dark:text-white/60">
                                                    Reference: <span className="font-mono">{tx?.reference}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-white/80">
                                                <Shield className="h-3.5 w-3.5" />
                                                {tx.transaction_type}
                                            </span>

                                            {tx.status === "SUCCESSFUL" && (
                                                <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    SUCCESSFUL
                                                </span>
                                            )}
                                            {tx.status === "PENDING" && (
                                                <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    PENDING
                                                </span>
                                            )}
                                            {tx.status === "FAILED" && (
                                                <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                                                    <XCircle className="h-3.5 w-3.5" />
                                                    FAILED
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Amount row */}
                                    <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-black/40">
                                        <div className="text-xs text-gray-600 dark:text-white/60">Amount</div>
                                        <div className="text-2xl font-semibold tracking-tight">${tx?.amount}</div>
                                    </div>

                                    {/* Details list */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between">
                                            <span className="flex items-center gap-2 text-xs text-gray-600 dark:text-white/60">
                                                <Hash className="h-4 w-4" /> Reference
                                            </span>
                                            <span className="font-mono">{tx.reference}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="flex items-center gap-2 text-xs text-gray-600 dark:text-white/60">
                                                <LinkIcon className="h-4 w-4" /> External Reference
                                            </span>
                                            <span className="font-mono">{tx.external_reference || "—"}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="flex items-center gap-2 text-xs text-gray-600 dark:text-white/60">
                                                <WalletIcon className="h-4 w-4" /> Wallet ID
                                            </span>
                                            <span className="font-mono">{tx.wallet_id}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="flex items-center gap-2 text-xs text-gray-600 dark:text-white/60">
                                                <User2 className="h-4 w-4" /> Sender
                                            </span>
                                            <span>{tx.sender?.username || tx.sender?.email || "—"}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="flex items-center gap-2 text-xs text-gray-600 dark:text-white/60">
                                                <User2 className="h-4 w-4" /> Receiver
                                            </span>
                                            <span>{tx.receiver?.username || tx.receiver?.email || "—"}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="flex items-center gap-2 text-xs text-gray-600 dark:text-white/60">
                                                <CalendarClock className="h-4 w-4" /> Timestamp
                                            </span>
                                            <span>{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : "—"}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Info note */}
                                <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 dark:border-white/10 dark:bg-black/40 dark:text-white/60">
                                    Keep your reference IDs safe. If you contact support, share the <span className="font-mono">reference</span> and <span className="font-mono">external_reference</span>.
                                </div>
                            </section>

                            {/* Right: Quick actions / meta */}
                            <aside className="lg:col-span-4">
                                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                                    <div className="mb-3 flex items-center gap-2">
                                        <div className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-black/40">
                                            <Shield className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold">Payment Integrity</div>
                                            <div className="text-xs text-gray-600 dark:text-white/60">Status and references shown are verified from the ledger.</div>
                                        </div>
                                    </div>

                                    <div className="mt-4 space-y-2">
                                        <button type="button" onClick={() => void copyText(tx.reference, "Reference")} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-transparent dark:text-white">
                                            <Copy className="h-4 w-4" />
                                            Copy Reference
                                        </button>
                                        <button type="button" onClick={() => void copyText(tx.external_reference, "External reference")} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-transparent dark:text-white">
                                            <Copy className="h-4 w-4" />
                                            Copy External Ref
                                        </button>
                                        <Link to="/dashboard/transactions" className="inline-flex w-full items-center justify-center rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 dark:bg-white dark:text-black">
                                            Back to Transactions
                                        </Link>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default TransactionDetail;
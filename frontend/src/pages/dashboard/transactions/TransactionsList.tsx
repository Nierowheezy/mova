// src/pages/dashboard/transactions/TransactionsList.tsx
import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock, XCircle, Wallet as WalletIcon, Hash, CalendarClock, ChevronRight } from "lucide-react";
import { DesktopSidebar, MobileSidebar } from "@/layout/Sidebar";
import DashboardHeader from "@/layout/DashboardHeader";
import { getTransactions } from "@/libs/core";
import { useApiData } from "@/hooks/useApiData";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";

type TransactionItem = {
    reference?: string;
    transaction_type?: string;
    transactionType?: string;
    amount?: number;
    status?: string;
    timestamp?: string;
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
    if (status === "SUCCESSFUL") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                SUCCESSFUL
            </span>
        );
    }
    if (status === "PENDING") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <Clock className="h-3.5 w-3.5" />
                PENDING
            </span>
        );
    }
    if (status === "FAILED") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                <XCircle className="h-3.5 w-3.5" />
                FAILED
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
            {status || "UNKNOWN"}
        </span>
    );
};

const TransactionList: React.FC = () => {
    const { data: transactions, loading, error, reload } = useApiData(
        async () => (await getTransactions()).data as TransactionItem[],
    );
    const rows = transactions ?? [];

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
                            <div className="show-from-sm text-sm text-gray-500 dark:text-white/60">/ Transactions</div>
                        </div>
                    </div>

                    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                        {/* Header */}
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h1 className="text-lg font-semibold">Transactions</h1>
                                <p className="text-sm text-gray-600 dark:text-white/60">Your recent deposits, transfers, withdrawals, and bills.</p>
                            </div>
                        </div>

                        {error ? (
                            <ErrorState
                                title="Couldn't load transactions"
                                message={error}
                                onRetry={reload}
                            />
                        ) : loading && !transactions ? (
                            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                                <SkeletonList count={5} />
                            </div>
                        ) : (
                            /* Table wrapper */
                            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
                                {rows.length === 0 && (
                                    <div style={{ padding: "var(--sp-10) 0" }}>
                                        <EmptyState
                                            icon={<WalletIcon size={20} />}
                                            title="No transactions yet"
                                            message="Your deposits, transfers and withdrawals will show up here."
                                        />
                                    </div>
                                )}

                                {/* Mobile (card) view */}
                                <ul className="divide-y divide-gray-200 p-2 sm:hidden dark:divide-white/10">
                                    {rows.map((tx) => (
                                        <li key={tx.reference}>
                                            <Link to={`/dashboard/transactions/${tx.reference}`} className="block">
                                                <div className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-white/5">
                                                    <div className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-black/40">
                                                        <WalletIcon className="h-5 w-5" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-sm font-semibold">{tx.transaction_type ?? tx.transactionType}</div>
                                                            <StatusBadge status={tx.status} />
                                                        </div>
                                                        <div className="mt-1 text-sm">${tx.amount ?? 0}</div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-white/60">
                                                            <span className="inline-flex items-center gap-1">
                                                                <Hash className="h-3.5 w-3.5" />
                                                                {tx?.reference}
                                                            </span>
                                                            <span className="inline-flex items-center gap-1">
                                                                <CalendarClock className="h-3.5 w-3.5" />
                                                                {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : "—"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="mt-1 h-4 w-4 text-gray-400 dark:text-white/50" />
                                                </div>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>

                                {/* Desktop (table) view */}
                                <div className="show-from-sm">
                                    <table className="min-w-full table-fixed border-separate border-spacing-0">
                                        <thead>
                                            <tr className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-600 dark:bg-black/40 dark:text-white/60">
                                                <th className="sticky top-0 z-[1] border-b border-gray-200 px-4 py-3 font-semibold dark:border-white/10">Type</th>
                                                <th className="sticky top-0 z-[1] border-b border-gray-200 px-4 py-3 font-semibold dark:border-white/10">Amount</th>
                                                <th className="sticky top-0 z-[1] border-b border-gray-200 px-4 py-3 font-semibold dark:border-white/10">Status</th>
                                                <th className="sticky top-0 z-[1] border-b border-gray-200 px-4 py-3 font-semibold dark:border-white/10">Reference</th>
                                                <th className="sticky top-0 z-[1] border-b border-gray-200 px-4 py-3 font-semibold dark:border-white/10">Timestamp</th>
                                                <th className="sticky top-0 z-[1] border-b border-gray-200 px-4 py-3 font-semibold dark:border-white/10">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                                            {rows.map((tx) => (
                                                <tr key={tx.reference} className="hover:bg-gray-50 dark:hover:bg-white/5">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-black/40">
                                                                <WalletIcon className="h-4 w-4" />
                                                            </div>
                                                            <span className="text-sm font-medium">{tx.transaction_type ?? tx.transactionType}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm font-semibold">${tx.amount ?? 0}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <StatusBadge status={tx.status} />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="font-mono text-xs">{tx.reference}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm">{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : "—"}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <Link to={`/dashboard/transactions/${tx.reference}`} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-transparent dark:text-white">
                                                            View
                                                            <ChevronRight className="h-3.5 w-3.5" />
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Footer note */}
                        <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 dark:border-white/10 dark:bg-black/40 dark:text-white/60">Click a transaction to view full details, copy references, and see ledger status.</div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default TransactionList;
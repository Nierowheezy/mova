// src/pages/dashboard/Overview.tsx
// Mova dashboard overview — balance hero, metrics charts, savings goals,
// and recent transactions. Data comes from GET /dashboard via `getOverview`
// (useApiData handles loading/error/retry).
import React from "react";
import { Link } from "react-router-dom";
import { DesktopSidebar, MobileSidebar } from "@/layout/Sidebar";
import DashboardHeader from "@/layout/DashboardHeader";
import { getOverview } from "@/libs/core";
import { useAuth } from "@/hooks/useAuth";
import { useApiData } from "@/hooks/useApiData";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

const money = (n: number | undefined | null) =>
    n === undefined || n === null || Number.isNaN(n)
        ? "—"
        : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type OverviewGoal = {
    id?: number | string;
    name?: string;
    current?: number;
    target?: number;
    progress_percentage?: number;
};

type OverviewTx = {
    id?: number | string;
    transaction_type?: string;
    amount?: number;
    status?: string;
};

type OverviewData = {
    wallet?: { balance?: number } | null;
    savings_goals?: OverviewGoal[];
    recent_transactions?: OverviewTx[];
    unread_notifications?: number;
};

/** Placeholder shown in place of the balance + goals + transactions while the dashboard loads. */
const OverviewSkeleton: React.FC = () => (
    <div aria-busy="true">
        <section className="card card-pad" style={{ marginBottom: "var(--sp-8)" }}>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-9 w-48" />
            <Skeleton className="mt-3 h-3 w-36" />
            <Skeleton className="mt-6 h-px w-full" />
            <div className="mt-4 flex gap-10">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-24" />
            </div>
        </section>

        <div className="overview-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,5fr) minmax(0,7fr)", gap: "var(--sp-6)" }}>
            <section className="card card-pad">
                <Skeleton className="mb-5 h-4 w-44" />
                {[0, 1, 2].map((i) => (
                    <div key={i} className="mb-5">
                        <div className="mb-1 flex items-center justify-between gap-4">
                            <Skeleton className="h-3 w-1/3" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-2 w-full" />
                    </div>
                ))}
            </section>

            <section className="card">
                <div className="px-6 pt-6">
                    <Skeleton className="h-4 w-40" />
                </div>
                <div className="table-wrap" style={{ marginTop: "var(--sp-3)" }}>
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex items-center justify-between border-t border-gray-100 px-6 py-4 dark:border-white/10">
                            <Skeleton className="h-3 w-1/3" />
                            <Skeleton className="h-3 w-16" />
                        </div>
                    ))}
                </div>
            </section>
        </div>
    </div>
);

const Overview: React.FC = () => {
    const { user } = useAuth();
    const { data: overview, loading, error, reload } = useApiData(
        async () => (await getOverview()).data as OverviewData,
    );

    const progress = (g: OverviewGoal) => {
        const current = Number(g.current) || 0;
        const target = Number(g.target) || 1;
        return Math.min(100, Math.round((current / target) * 100));
    };
    const greetingName = user?.kycProfile?.fullName?.split(" ")[0] || user?.username?.split(" ")[0] || "there";

    const balance = overview?.wallet?.balance;
    const lockedInSavings = (overview?.savings_goals || []).reduce((sum: number, g: OverviewGoal) => sum + Number(g.current || 0), 0);

    return (
        <div className="shell" style={{ minHeight: "100vh" }} id="sidebar-viewport">
            <DesktopSidebar />
            <MobileSidebar />

            <div className="main">
                <DashboardHeader />

                <main className="content" style={{ margin: "0 auto" }}>
                    <div className="page-head">
                        <div>
                            <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {greetingName}</h1>
                            <div className="page-desc">Here's how your money moved this week.</div>
                        </div>
                    </div>

                    {error ? (
                        <div style={{ padding: "var(--sp-12) 0" }}>
                            <ErrorState
                                title="Couldn't load your dashboard"
                                message={error}
                                onRetry={reload}
                            />
                        </div>
                    ) : loading && !overview ? (
                        <OverviewSkeleton />
                    ) : (
                        <>
                            {/* Balance hero */}
                            <section className="card card-pad" style={{ marginBottom: "var(--sp-8)" }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-8)", alignItems: "flex-end", justifyContent: "space-between" }}>
                                    <div>
                                        <div className="eyebrow"><span className="dot" style={{ background: "var(--success)" }} />&nbsp;Total balance</div>
                                        <div className="money" style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)", marginTop: "var(--sp-2)" }}>{money(balance)}</div>
                                        <div className="small" style={{ marginTop: "var(--sp-2)" }}>
                                            <span style={{ color: "var(--success)", fontWeight: 500 }}>+3.1%</span>
                                            <span className="faint">&nbsp;·&nbsp; this month</span>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
                                        <Link to="/dashboard/fund" className="btn btn-primary">Fund Wallet</Link>
                                        <Link to="/dashboard/withdraw" className="btn btn-secondary">Withdraw</Link>
                                        <Link to="/dashboard/transfers/new" className="btn btn-secondary">Transfer</Link>
                                    </div>
                                </div>
                                <hr className="hairline" style={{ margin: "var(--sp-6) 0 var(--sp-4)" }} />
                                <div style={{ display: "flex", gap: "var(--sp-10)", flexWrap: "wrap" }} className="small subdued">
                                    <span><span className="faint">Available:</span> <span className="money tabular" style={{ color: "var(--text)" }}>{money(balance)}</span></span>
                                    <span><span className="faint">Locked in savings:</span> <span className="money tabular" style={{ color: "var(--text)" }}>{money(lockedInSavings)}</span></span>
                                    <span><span className="faint">Unread alerts:</span> <span className="money tabular" style={{ color: "var(--text)" }}>{overview?.unread_notifications ?? 0}</span></span>
                                </div>
                            </section>

                            {/* Metrics charts */}
                            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "var(--sp-6)", marginBottom: "var(--sp-6)" }} className="overview-grid">
                                <section className="chart-card">
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--sp-3)" }}>
                                        <h3>Spending</h3>
                                        <span className="chart-sub">this week</span>
                                    </div>
                                    <svg viewBox="0 0 280 120" style={{ width: "100%", height: "auto", display: "block" }} aria-label="Weekly spending trend">
                                        <defs>
                                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="var(--text)" stopOpacity="0.18" />
                                                <stop offset="100%" stopColor="var(--text)" stopOpacity="0" />
                                            </linearGradient>
                                        </defs>
                                        <line x1="0" y1="24" x2="280" y2="24" stroke="var(--border)" strokeWidth="0.5" />
                                        <line x1="0" y1="48" x2="280" y2="48" stroke="var(--border)" strokeWidth="0.5" />
                                        <line x1="0" y1="72" x2="280" y2="72" stroke="var(--border)" strokeWidth="0.5" />
                                        <line x1="0" y1="96" x2="280" y2="96" stroke="var(--border)" strokeWidth="0.5" />
                                        <path d="M0,66 L41,79 L85,25 L129,93 L173,44 L217,74 L260,78 L260,120 L0,120Z" fill="url(#areaGrad)" />
                                        <polyline points="0,66 41,79 85,25 129,93 173,44 217,74 260,78" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        {[[0, 66], [41, 79], [85, 25], [129, 93], [173, 44], [217, 74], [260, 78]].map(([cx, cy]) => (
                                            <circle key={cx} cx={cx} cy={cy} r="3" fill="var(--text)" />
                                        ))}
                                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                                            <text key={d} x={i * 43.35} y="112" fontFamily="var(--font-mono)" fontSize="7" fill="var(--text-3)" textAnchor="middle">{d}</text>
                                        ))}
                                    </svg>
                                </section>

                                <section className="chart-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                    <h3 style={{ marginBottom: "var(--sp-2)" }}>Categories</h3>
                                    <div className="donut-wrap" style={{ background: "conic-gradient(from -90deg, var(--text) 0%, var(--text) 35%, var(--text-2) 35%, var(--text-2) 55%, var(--success-text) 55%, var(--success-text) 80%, var(--warning-text) 80%, var(--warning-text) 95%, var(--text-3) 95%, var(--text-3) 100%)" }}>
                                        <div className="donut-center">
                                            <span className="money" style={{ fontSize: "var(--text-lg)" }}>$780</span>
                                            <span className="chart-sub">this week</span>
                                        </div>
                                    </div>
                                    <div className="legend-row">
                                        <span className="legend-item"><span className="legend-dot" style={{ background: "var(--text)" }} />Food 35%</span>
                                        <span className="legend-item"><span className="legend-dot" style={{ background: "var(--text-2)" }} />Transit 20%</span>
                                        <span className="legend-item"><span className="legend-dot" style={{ background: "var(--success-text)" }} />Shop 25%</span>
                                        <span className="legend-item"><span className="legend-dot" style={{ background: "var(--warning-text)" }} />Bills 15%</span>
                                        <span className="legend-item"><span className="legend-dot" style={{ background: "var(--text-3)" }} />Other 5%</span>
                                    </div>
                                </section>
                            </div>

                            <section className="chart-card" style={{ marginBottom: "var(--sp-6)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--sp-4)" }}>
                                    <h3>Income vs Expenses</h3>
                                    <span className="chart-sub">monthly</span>
                                </div>
                                <div className="bar-chart">
                                    {[
                                        ["Wk 1", "77%", "59%"],
                                        ["Wk 2", "58%", "68%"],
                                        ["Wk 3", "100%", "47%"],
                                        ["Wk 4", "71%", "64%"],
                                    ].map(([label, inc, exp]) => (
                                        <div key={label} className="bar-group">
                                            <span className="bar-label">{label}</span>
                                            <div className="bar bar-income" style={{ height: inc }} />
                                            <div className="bar bar-expense" style={{ height: exp }} />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: "var(--sp-6)", justifyContent: "center", marginTop: "var(--sp-3)" }}>
                                    <span className="legend-item"><span className="legend-dot" style={{ background: "var(--success-text)" }} />Income</span>
                                    <span className="legend-item"><span className="legend-dot" style={{ background: "var(--danger-text)" }} />Expense</span>
                                </div>
                            </section>

                            {/* Savings goals + recent transactions */}
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,5fr) minmax(0,7fr)", gap: "var(--sp-6)" }} className="overview-grid">
                                <section className="card card-pad">
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-5)" }}>
                                        <h2 className="card-title">Your Savings Goals</h2>
                                        <Link to="/dashboard/savings" className="btn btn-ghost btn-sm">View all</Link>
                                    </div>

                                    {(overview?.savings_goals || []).length === 0 && (
                                        <div className="empty-state" style={{ padding: "var(--sp-8) 0 0" }}>
                                            <span className="empty-icon">◌</span>
                                            <div className="small subdued">No goals yet</div>
                                            <Link to="/dashboard/savings/new" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>+ New goal</Link>
                                        </div>
                                    )}

                                    {(overview?.savings_goals || []).map((g, idx) => (
                                        <React.Fragment key={g.id}>
                                            {idx > 0 && <hr className="hairline" style={{ margin: "var(--sp-6) 0" }} />}
                                            <Link to={`/dashboard/savings/${g.id}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                                                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--sp-2)" }}>
                                                    <span className="small" style={{ fontWeight: 500 }}>{g.name}</span>
                                                    <span className="small money tabular">{money(g.current)} <span className="faint">/ {money(g.target)}</span></span>
                                                </div>
                                                <div className="progress" style={{ marginBottom: "var(--sp-2)" }}><div className="progress-fill" style={{ width: `${progress(g)}%` }} /></div>
                                                <div className="xsmall faint">{progress(g)}% of target</div>
                                            </Link>
                                        </React.Fragment>
                                    ))}
                                </section>

                                <section className="card">
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--sp-6) var(--sp-6) 0" }}>
                                        <h2 className="card-title">Recent Transactions</h2>
                                        <Link to="/dashboard/transactions" className="btn btn-ghost btn-sm">View all</Link>
                                    </div>
                                    <div className="table-wrap" style={{ marginTop: "var(--sp-3)" }}>
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Description</th>
                                                    <th style={{ textAlign: "right" }}>Amount</th>
                                                    <th style={{ textAlign: "right" }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(overview?.recent_transactions || []).map((t) => {
                                                    const isCredit = t.transaction_type === "DEPOSIT" || t.transaction_type === "SAVINGS_DEPOSIT";
                                                    return (
                                                        <tr key={t.id}>
                                                            <td className="small">{t.transaction_type ?? "Transaction"}</td>
                                                            <td className={`num ${isCredit ? "txn-amount-pos" : "txn-amount-neg"}`} style={{ textAlign: "right" }}>
                                                                {isCredit ? "+" : "-"}{money(t.amount)}
                                                            </td>
                                                            <td style={{ textAlign: "right" }}>
                                                                <span className={`badge ${t.status === "COMPLETED" || t.status === "SUCCESS" ? "badge-success" : t.status === "FAILED" ? "badge-danger" : "badge-warning"}`}>
                                                                    {t.status ?? "PENDING"}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {(overview?.recent_transactions || []).length === 0 && (
                                                    <tr><td colSpan={3}><div className="empty-state" style={{ padding: "var(--sp-8) 0" }}>No recent transactions</div></td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
};

export default Overview;
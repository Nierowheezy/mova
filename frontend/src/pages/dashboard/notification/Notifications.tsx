import { DesktopSidebar, MobileSidebar } from "@/layout/Sidebar";
import DashboardHeader from "@/layout/DashboardHeader";
import { CheckCircle2, ArrowRight, Check, BellOff } from "lucide-react";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/libs/core";
import { Link } from "react-router-dom";
import { useApiData } from "@/hooks/useApiData";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";

type NotificationItem = {
    id?: number;
    title?: string;
    message?: string;
    timestamp?: string;
    tx_reference?: string | null;
};

const Notifications = () => {
    const { data: items, loading, error, reload } = useApiData(
        async () => (await getNotifications()).data as NotificationItem[],
    );

    const { run: markOne, pending: markingOne } = useAsyncAction(
        async (id: number) => {
            await markNotificationRead(id);
            await reload();
        },
        { successMessage: "Marked as read", showSuccessToast: true, errorMessage: "Failed to mark as read" },
    );

    const { run: markAll, pending: markingAll } = useAsyncAction(
        async () => {
            await markAllNotificationsRead();
            await reload();
        },
        { successMessage: "Marked all notifications as read", showSuccessToast: true, errorMessage: "Failed to mark as read" },
    );

    return (
        <div className="min-h-screen bg-white text-gray-900 antialiased dark:bg-[#0a0a0a] dark:text-white">
            <div className="flex">
                {/* Sidebar */}
                <DesktopSidebar />
                <MobileSidebar />

                {/* Main */}
                <div className="flex min-h-screen flex-1 flex-col">
                    <DashboardHeader />

                    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
                        {/* Header row */}
                        <div className="mb-6 flex items-center justify-between">
                            <div>
                                <h1 className="text-lg font-semibold">Notifications</h1>
                                <p className="text-sm text-gray-600 dark:text-white/60">Latest updates on your transactions and activity.</p>
                            </div>

                            <button onClick={() => void markAll()} type="button" disabled={markingAll || (items ?? []).length === 0} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5" title="Mark all as read">
                                <Check className="h-4 w-4" />
                                {markingAll ? "Marking…" : "Mark all as read"}
                            </button>
                        </div>

                        {error ? (
                            <ErrorState
                                title="Couldn't load notifications"
                                message={error}
                                onRetry={reload}
                            />
                        ) : loading && !items ? (
                            <SkeletonList count={4} />
                        ) : (items ?? []).length === 0 ? (
                            <EmptyState
                                icon={<BellOff size={20} />}
                                title="No notifications yet"
                                message="Updates about your transactions and account will appear here."
                            />
                        ) : (
                            <div className="space-y-4">
                                {items?.map((n) => (
                                    <div key={n.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-white/5">
                                        <div className="flex items-start gap-3">
                                            <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-black/40">
                                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-sm font-medium">{n.title}</h3>
                                                    <span className="text-xs text-gray-500 dark:text-white/60">{n.timestamp ? new Date(n.timestamp).toLocaleString() : "—"}</span>
                                                </div>
                                                <p className="mt-1 text-sm text-gray-600 dark:text-white/70">{n?.message}</p>
                                                <div className="mt-2 flex items-center gap-3">
                                                    {n?.tx_reference && (
                                                        <Link to={`/dashboard/transactions/${n?.tx_reference}`} className="inline-flex items-center gap-1 text-xs font-medium text-gray-900 underline-offset-4 hover:underline dark:text-white">
                                                            View transaction <ArrowRight className="h-3 w-3" />
                                                        </Link>
                                                    )}
                                                    <button onClick={() => void markOne(Number(n.id))} disabled={markingOne} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 dark:text-white/70 dark:hover:text-white">
                                                        <Check className="h-3 w-3" />
                                                        Mark as read
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
};

export default Notifications;
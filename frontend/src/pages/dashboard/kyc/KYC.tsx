import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, User2, Calendar, IdCard, UploadCloud, ShieldCheck, Info } from "lucide-react";
import { DesktopSidebar, MobileSidebar } from "@/layout/Sidebar";
import DashboardHeader from "@/layout/DashboardHeader";
import { createKyc, uploadFile, kycProfile, type KycRecord } from "@/libs/user";
import apiClient from "@/libs/apiClient";
import { useApiData } from "@/hooks/useApiData";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { validateFullName } from "@/libs/validation";
import FieldError from "@/components/ui/FieldError";

/** Map a stored KYC record to a display label and color for the status card. */
const statusInfo = (k: KycRecord | null): { label: string; className: string } => {
    switch ((k?.verification_status ?? "UNVERIFIED").toUpperCase()) {
        case "VERIFIED":
            return { label: "Verified", className: "text-emerald-600 dark:text-emerald-400" };
        case "PENDING":
            return { label: "Pending Review", className: "text-amber-600 dark:text-amber-400" };
        case "REJECTED":
            return { label: "Rejected", className: "text-rose-600 dark:text-rose-400" };
        default:
            return { label: "Unverified", className: "text-amber-600 dark:text-amber-400" };
    }
};

const KYC: React.FC = () => {
    // State for form fields
    const [fullName, setFullName] = React.useState("");
    const [dob, setDob] = React.useState("");
    const [idType, setIdType] = React.useState("NATIONAL_ID");
    const [idImageUrl, setIdImageUrl] = React.useState("");

    const [localError, setLocalError] = React.useState(""); // Client-side validation
    const [successMsg, setSuccessMsg] = React.useState(""); // Success feedback
    const [blurred, setBlurred] = React.useState({ fullName: false, dob: false, idImage: false });

    // Preview source: a fresh upload uses the local file bytes (instant), a
    // pasted URL renders directly, and an already-submitted fileId is fetched
    // through the authenticated KYC document endpoint.
    const [previewUrl, setPreviewUrl] = React.useState("");
    const localPreviewRef = React.useRef<string | null>(null);

    // Debounced copies power live checks; blur covers the required cases.
    const liveFullName = useDebouncedValue(fullName.trim(), 500);
    const liveDob = useDebouncedValue(dob, 500);
    const today = new Date().toISOString().slice(0, 10);

    const fullNameIssue = validateFullName(fullName);
    const dobIssue = !dob ? "Date of birth is required" : dob >= today ? "Date of birth must be in the past" : "";
    const idImageIssue = !idImageUrl.trim() ? "Add your ID image (upload or URL)" : "";

    const showFullNameErr = !!(fullNameIssue && (blurred.fullName || liveFullName.length > 0));
    const showDobErr = !!(dobIssue && (blurred.dob || liveDob.length > 0));
    const showIdImageErr = !!idImageIssue && blurred.idImage;

    const { data: profile, error: profileError, setData } = useApiData<KycRecord | null>(
        async () => (await kycProfile()).data,
    );

    // Pre-fill the form if the user already submitted KYC.
    React.useEffect(() => {
        if (profile) {
            setFullName(profile?.full_name || "");
            if (profile?.date_of_birth) {
                const d = String(profile?.date_of_birth);
                setDob(d.length > 10 ? d.slice(0, 10) : d);
            }
            setIdType(profile?.id_type || "NATIONAL_ID");
            setIdImageUrl(profile?.id_image || "");
        }
    }, [profile]);

    const alreadySubmitted = Boolean(profile);
    const status = statusInfo(profile);

    const { run: uploadId, pending: uploading, error: uploadError } = useAsyncAction(
        async (file: File) => {
            const fileId = await uploadFile(file);
            // Show the chosen file instantly from local bytes (the stored
            // value is an opaque fileId, not a public URL).
            if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
            localPreviewRef.current = URL.createObjectURL(file);
            setPreviewUrl(localPreviewRef.current);
            setIdImageUrl(fileId);
            return fileId;
        },
        { errorMessage: "Couldn't upload file — try again" },
    );

    // Resolve a stored fileId into a previewable object URL. Runs only when
    // there is no fresh local upload; the backend lets the owner read their
    // own document once the KYC record exists (page reloads after submit).
    React.useEffect(() => {
        if (localPreviewRef.current) return;
        let objectUrl = "";
        let cancelled = false;
        const ref = idImageUrl.trim();
        if (!ref) {
            setPreviewUrl("");
            return;
        }
        if (/^https?:\/\//i.test(ref)) {
            setPreviewUrl(ref);
            return;
        }
        apiClient
            .get(`/kyc/documents/${encodeURIComponent(ref)}`, { responseType: "blob" })
            .then((res) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(res.data as Blob);
                setPreviewUrl(objectUrl);
            })
            .catch(() => {
                if (!cancelled) setPreviewUrl("");
            });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [idImageUrl]);

    React.useEffect(() => {
        return () => {
            if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
        };
    }, []);

    const { run: submitKyc, pending: submitting, error: submitError } = useAsyncAction(
        async (payload: { full_name: string; date_of_birth: string; id_type: string; id_image: string }) => {
            const resp = await createKyc(payload);
            const saved = resp?.data?.kyc || payload;
            setData({
                ...payload,
                ...saved,
            });
            return resp?.data?.message;
        },
        { successMessage: "KYC submitted", showSuccessToast: true, errorMessage: "Couldn't submit KYC — try again" },
    );

    const errorMsg = submitError ?? uploadError ?? localError;

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setLocalError("");
        setSuccessMsg("");
        await uploadId(file);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (alreadySubmitted) return;
        setLocalError("");
        setSuccessMsg("");

        setBlurred({ fullName: true, dob: true, idImage: true });
        if (fullNameIssue || dobIssue || idImageIssue) {
            setLocalError(fullNameIssue || dobIssue || idImageIssue);
            return;
        }

        const msg = await submitKyc({
            full_name: fullName.trim(),
            date_of_birth: dob,
            id_type: idType,
            id_image: idImageUrl.trim(),
        });

        if (msg) setSuccessMsg(msg);
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

                    {/* Top bar / breadcrumb */}
                    <div className="mx-auto flex max-w-7xl items-center justify-between px-4 pt-6 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-2">
                            <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white">
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </Link>
                            <div className="hidden text-sm text-gray-500 dark:text-white/60 sm:block">/ Settings / KYC</div>
                        </div>
                    </div>

                    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                            {/* Left: guidance / status */}
                            <aside className="lg:col-span-4">
                                {/* Status card */}
                                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                                    <div className="flex items-center gap-2">
                                        <div className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-black/40">
                                            <ShieldCheck className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold">KYC Verification</div>
                                            <div className="text-xs text-gray-600 dark:text-white/60">
                                                Status: <span className={`font-medium ${status.className}`}>{status.label}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-3 text-xs text-gray-600 dark:border-white/10 dark:text-white/60">
                                        <p>Submit your legal name, date of birth, ID type, and a photo/scan of your ID.</p>
                                        <ul className="mt-2 list-inside list-disc space-y-1">
                                            <li>Name must match your government ID.</li>
                                            <li>Date of birth must be in the past.</li>
                                            <li>Accepted IDs: National ID, Driver&apos;s License, Passport.</li>
                                            <li>Image should be clear, full document, no glare.</li>
                                        </ul>
                                    </div>

                                    <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-white/10 dark:bg-black/40 dark:text-white/80">
                                        <div className="flex items-start gap-2">
                                            <Info className="mt-0.5 h-4 w-4" />
                                            <p>
                                                {status.label === "Verified" ? (
                                                    "Your identity has been verified. You can now send money to other wallets."
                                                ) : status.label === "Rejected" ? (
                                                    <>Your submission was rejected{profile?.rejection_reason ? `: ${profile.rejection_reason}` : ". Contact support to reapply"}. </>
                                                ) : (
                                                    <>
                                                        By submitting, you consent to verification and secure storage of KYC metadata. Your verification status will show as <strong>Pending Review</strong> until approved.
                                                    </>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </aside>

                            {/* Right: form (UI only — no logic) */}
                            <section className="lg:col-span-8">
                                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
                                    <div className="mb-5">
                                        {profileError && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Couldn’t load your current KYC status: {profileError}</div>}
                                        {errorMsg ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{errorMsg}</div> : null}
                                        {successMsg ? <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">{successMsg}</div> : null}
                                        <h1 className="text-lg font-semibold">Submit your KYC</h1>
                                        <p className="text-sm text-gray-600 dark:text-white/60">This helps us keep your account safe and compliant.</p>
                                    </div>

                                    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
                                        {/* Full name */}
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-white/70" htmlFor="kyc-fullname">
                                                Full name
                                            </label>
                                            <div className="relative">
                                                <User2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/50" />
                                                <input
                                                    id="kyc-fullname"
                                                    type="text"
                                                    value={fullName}
                                                    onChange={(e) => setFullName(e.target.value)}
                                                    onBlur={() => setBlurred((b) => ({ ...b, fullName: true }))}
                                                    disabled={alreadySubmitted}
                                                    placeholder="As shown on your ID"
                                                    aria-invalid={showFullNameErr}
                                                    className={`w-full rounded-xl border bg-white px-9 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none ring-0 transition focus:border-gray-400 dark:bg-transparent dark:text-white dark:placeholder:text-white/50 ${
                                                        showFullNameErr ? "border-red-400 dark:border-red-500/60" : "border-gray-300 dark:border-white/10"
                                                    }`}
                                                />
                                            </div>
                                            <FieldError message={showFullNameErr ? fullNameIssue : undefined} />
                                        </div>

                                        {/* Date of birth */}
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-white/70" htmlFor="kyc-dob">
                                                Date of birth
                                            </label>
                                            <div className="relative">
                                                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/50" />
                                                <input
                                                    id="kyc-dob"
                                                    type="date"
                                                    value={dob}
                                                    onChange={(e) => setDob(e.target.value)}
                                                    onBlur={() => setBlurred((b) => ({ ...b, dob: true }))}
                                                    max={today}
                                                    aria-invalid={showDobErr}
                                                    className={`w-full rounded-xl border bg-white px-9 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none ring-0 transition focus:border-gray-400 dark:bg-transparent dark:text-white ${
                                                        showDobErr ? "border-red-400 dark:border-red-500/60" : "border-gray-300 dark:border-white/10"
                                                    }`}
                                                />
                                            </div>
                                            <FieldError message={showDobErr ? dobIssue : undefined} />
                                        </div>

                                        {/* ID type */}
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-white/70">ID type</label>
                                            <div className="relative">
                                                <IdCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/50" />
                                                <select value={idType} onChange={(e) => setIdType(e.target.value)} disabled={alreadySubmitted} className="w-full appearance-none rounded-xl border border-gray-300 bg-white px-9 py-2 text-sm text-gray-900 outline-none ring-0 transition focus:border-gray-400 dark:border-white/10 dark:bg-transparent dark:text-white">
                                                    <option value="NATIONAL_ID">National ID Card</option>
                                                    <option value="DRIVERS_LICENSE">Driver&apos;s License</option>
                                                    <option value="PASSPORT">International Passport</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* ID image (URL + upload control w/o logic) */}
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-white/70" htmlFor="kyc-id-url">
                                                    ID image URL
                                                </label>
                                                <input
                                                    id="kyc-id-url"
                                                    value={idImageUrl}
                                                    onChange={(e) => setIdImageUrl(e.target.value)}
                                                    onBlur={() => setBlurred((b) => ({ ...b, idImage: true }))}
                                                    disabled={alreadySubmitted}
                                                    type="url"
                                                    placeholder="https://…"
                                                    aria-invalid={showIdImageErr}
                                                    className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none ring-0 transition focus:border-gray-400 dark:bg-transparent dark:text-white dark:placeholder:text-white/50 ${
                                                        showIdImageErr ? "border-red-400 dark:border-red-500/60" : "border-gray-300 dark:border-white/10"
                                                    }`}
                                                />
                                                <p className="mt-1 text-[11px] text-gray-500 dark:text-white/60">Uploads are stored privately and a reference is saved with your submission. You can also paste a hosted document URL.</p>
                                                <FieldError message={showIdImageErr ? idImageIssue : undefined} />
                                            </div>

                                            <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-white/70">Or upload your ID document</label>
                                                <div className="flex items-center gap-3">
                                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5">
                                                        <UploadCloud className="h-4 w-4" />
                                                        <span>{uploading ? "Uploading..." : "Choose file"}</span>
                                                        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={uploading || alreadySubmitted} />
                                                    </label>
                                                    <span className="text-xs text-gray-600 dark:text-white/60">PNG/JPG up to ~5MB</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Preview card (static placeholder) */}
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-black/40">
                                                <div className="text-xs text-gray-600 dark:text-white/60">Live preview</div>
                                                <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
                                                    <div className="grid h-48 place-items-center text-xs text-gray-500 dark:text-white/50">{previewUrl ? <img src={previewUrl} alt="ID Preview" className="h-48 w-full object-contain" /> : "No image selected"}</div>
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-white/10 dark:bg-black/40">
                                                <div className="text-xs text-gray-600 dark:text-white/60">What we’ll store</div>
                                                <ul className="mt-2 list-inside list-disc space-y-1 text-gray-700 dark:text-white/80">
                                                    <li>
                                                        <span className="font-medium">full_name</span> {fullName || "—"}
                                                    </li>
                                                    <li>
                                                        <span className="font-medium">date_of_birth</span> {dob || "—"}
                                                    </li>
                                                    <li>
                                                        <span className="font-medium">id_type</span> {idType || "—"}
                                                    </li>
                                                    <li>
                                                        <span className="font-medium">id_image</span> {idImageUrl || "—"}
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>

                                        {/* Submit */}
                                        <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                                            <div className="text-xs text-gray-600 dark:text-white/60">Submissions are reviewed within 24–72 hours.</div>
                                            <div className="flex gap-2">
                                                <Link to="/dashboard" className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5">
                                                    Cancel
                                                </Link>
                                                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 dark:bg-white dark:text-black">
                                                    {alreadySubmitted ? "KYC Submitted" : submitting ? "Submitting..." : "Submit KYC"}
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>

                                {/* Footer tip */}
                                <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 dark:border-white/10 dark:bg-black/40 dark:text-white/60">If you already submitted KYC and need corrections, please contact support. Duplicate submissions aren’t allowed.</div>
                            </section>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default KYC;

import apiClient from "./apiClient";

/** snake_case KYC record used by the KYC page. */
export interface KycRecord {
    id?: number;
    full_name?: string;
    date_of_birth?: string | null;
    id_type?: string;
    id_image?: string | null;
    verification_status?: string;
    auto_verify?: boolean;
    rejection_reason?: string | null;
    created_at?: string;
    updated_at?: string;
}

/**
 * Convert the Node.js backend's camelCase KYC record into the
 * snake_case shape the KYC page renders (full_name, date_of_birth, etc.).
 */
const toSnakeCaseKyc = (k: { [key: string]: unknown } | undefined): KycRecord => ({
    id: typeof k?.id === "number" ? k.id : undefined,
    full_name: typeof k?.fullName === "string" ? k.fullName : "",
    date_of_birth:
        typeof k?.dateOfBirth === "string" && k.dateOfBirth
            ? String(k.dateOfBirth).slice(0, 10)
            : null,
    id_type: typeof k?.idType === "string" ? k.idType : "NATIONAL_ID",
    id_image: typeof k?.idImage === "string" ? k.idImage : null,
    verification_status: typeof k?.verificationStatus === "string" ? k.verificationStatus : "PENDING",
    auto_verify: typeof k?.autoVerify === "boolean" ? k.autoVerify : undefined,
    rejection_reason: typeof k?.rejectionReason === "string" ? k.rejectionReason : null,
    created_at: typeof k?.createdAt === "string" ? k.createdAt : undefined,
    updated_at: typeof k?.updatedAt === "string" ? k.updatedAt : undefined,
});

/**
 * Submit KYC information.
 * The Node.js backend expects camelCase fields at `POST /api/v1/kyc`.
 */
export const createKyc = async (payload: {
    full_name: string;
    date_of_birth: string;
    id_type: string;
    id_image: string;
}) => {
    const response = await apiClient.post("/kyc", {
        fullName: payload.full_name,
        dateOfBirth: payload.date_of_birth,
        idType: payload.id_type,
        idImage: payload.id_image,
    });

    const kyc = response.data?.data;

    return {
        success: response.data?.success,
        data: {
            message: kyc ? "KYC submitted successfully" : undefined,
            kyc: kyc ? toSnakeCaseKyc(kyc as { [key: string]: unknown }) : undefined,
        },
    };
};

/**
 * Get the current user's KYC profile.
 * Returns `{ data: null }` when the user hasn't submitted KYC yet
 * (the backend replies 404, which the page treats as "not submitted").
 */
export const kycProfile = async (): Promise<{ data: KycRecord | null }> => {
    try {
        const response = await apiClient.get("/kyc/profile");
        const kyc = response.data?.data;
        return { data: kyc ? toSnakeCaseKyc(kyc as { [key: string]: unknown }) : null };
    } catch {
        return { data: null };
    }
};

/**
 * Upload a file (e.g. a KYC ID image).
 * The updated Node.js backend stores the file privately and returns an opaque
 * `fileId` (`data.data = { fileId, originalName, size, mimeType }`); that
 * fileId is what KYC submission expects as `idImage`. Older backends returned
 * a public URL string directly, so both shapes are handled here.
 */
export const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const { data } = await apiClient.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });

    const payload = data?.data as { fileId?: unknown } | string | undefined;
    if (typeof payload === "string") return payload; // legacy URL response
    return typeof payload?.fileId === "string" ? payload.fileId : "";
};
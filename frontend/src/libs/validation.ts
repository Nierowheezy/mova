// src/libs/validation.ts
// Shared client-side validators used by every form (auth, transfer, fund,
// withdraw, savings, KYC, settings). Each returns an error message or "".
// Values are validated on blur (immediate feedback) and on a debounced
// timer while typing so long inputs don't re-validate on every keystroke.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PIN_RE = /^\d{4}$/;

export const isEmpty = (value: string | undefined | null) => !value || !value.trim();

export const validateEmail = (value: string, required = true): string => {
    const v = value.trim();
    if (isEmpty(v)) return required ? "Email is required" : "";
    if (!EMAIL_RE.test(v)) return "Enter a valid email address";
    return "";
};

export const validatePassword = (value: string, required = true, min = 8): string => {
    if (isEmpty(value)) return required ? "Password is required" : "";
    if (value.length < min) return `Password must be at least ${min} characters`;
    return "";
};

export const validateAmount = (value: string | number, opts?: { required?: boolean; max?: number; label?: string }): string => {
    const raw = typeof value === "number" ? String(value) : value.trim();
    if (isEmpty(raw)) return opts?.required === false ? "" : "Enter an amount";
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return "Enter an amount greater than 0";
    if (opts?.max !== undefined && n > opts.max) return `Amount can't exceed ${opts.max.toLocaleString()}`;
    if (raw.split(".")[1]?.length > 2) return "Amounts have at most 2 decimal places";
    return "";
};

export const validatePin = (value: string, required = true): string => {
    const v = value.trim();
    if (isEmpty(v)) return required ? "Transaction PIN is required" : "";
    if (!PIN_RE.test(v)) return "PIN must be exactly 4 digits";
    return "";
};

export const validateWalletId = (value: string, required = true): string => {
    const v = value.trim();
    if (isEmpty(v)) return required ? "Wallet ID is required" : "";
    if (v.length !== 10) return "Wallet IDs are 10 digits";
    if (!/^\d+$/.test(v)) return "Wallet IDs contain digits only";
    return "";
};

export const validateName = (value: string, label = "This field", required = true): string => {
    if (isEmpty(value)) return required ? `${label} is required` : "";
    return "";
};

export const validateFullName = (value: string, required = true): string => {
    if (isEmpty(value)) return required ? "Full name is required" : "";
    if (value.trim().split(/\s+/).length < 2) return "Enter your first and last name";
    return "";
};

export const validateConfirm = (value: string, match: string, label = "Passwords"): string => {
    if (value !== match) return `${label} don't match`;
    return "";
};
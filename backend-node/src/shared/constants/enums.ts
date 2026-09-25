// These match the PostgreSQL enums but as TypeScript types

export const VerificationStatus = {
  UNVERIFIED: "UNVERIFIED",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;

export type VerificationStatus =
  (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const IDType = {
  NATIONAL_ID: "NATIONAL_ID",
  DRIVERS_LICENSE: "DRIVERS_LICENSE",
  PASSPORT: "PASSPORT",
} as const;

export type IDType = (typeof IDType)[keyof typeof IDType];

export const TransactionType = {
  DEPOSIT: "DEPOSIT",
  TRANSFER: "TRANSFER",
  WITHDRAWAL: "WITHDRAWAL",
  SAVINGS: "SAVINGS",
} as const;

export type TransactionType =
  (typeof TransactionType)[keyof typeof TransactionType];

export const TransactionStatus = {
  PENDING: "PENDING",
  SUCCESSFUL: "SUCCESSFUL",
  FAILED: "FAILED",
} as const;

export type TransactionStatus =
  (typeof TransactionStatus)[keyof typeof TransactionStatus];

export const NotificationType = {
  DEPOSIT: "DEPOSIT",
  TRANSFER: "TRANSFER",
  WITHDRAWAL: "WITHDRAWAL",
  SAVINGS: "SAVINGS",
} as const;

export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

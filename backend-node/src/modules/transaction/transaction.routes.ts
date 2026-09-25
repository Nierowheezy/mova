import { Router } from "express";
import { TransactionController } from "./transaction.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";

const router = Router();
const transactionController = new TransactionController();

router.use(authenticate);

/**
 * @swagger
 * /transactions/statement/pdf:
 *   get:
 *     summary: Download account statement as PDF
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: PDF statement
 *       400:
 *         description: Missing date parameters
 */
router.get(
  "/statement/pdf",
  transactionController.downloadStatementPdf.bind(transactionController),
);

/**
 * @swagger
 * /transactions:
 *   get:
 *     summary: Get user's transaction history
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [DEPOSIT, TRANSFER, WITHDRAWAL, SAVINGS] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, SUCCESSFUL, FAILED] }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: List of transactions with pagination
 */
router.get(
  "/",
  transactionController.getUserTransactions.bind(transactionController),
);

/**
 * @swagger
 * /transactions/{reference}/pdf:
 *   get:
 *     summary: Download transaction receipt as PDF
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Transaction not found
 */
router.get(
  "/:reference/pdf",
  transactionController.downloadReceiptPdf.bind(transactionController),
);

/**
 * @swagger
 * /transactions/{reference}:
 *   get:
 *     summary: Get transaction details by reference
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Transaction details
 *       404:
 *         description: Transaction not found
 */
router.get(
  "/:reference",
  transactionController.getTransactionDetails.bind(transactionController),
);

export default router;

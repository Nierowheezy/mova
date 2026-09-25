import { Router } from "express";
import { authenticate } from "../../shared/middleware/auth.middleware";
import { requireAdmin } from "../../shared/middleware/admin.middleware";
import { validate } from "../../shared/middleware/validation.middleware";
import { AdminKYCController } from "./controllers/kyc.controller";
import { AdminUserController } from "./controllers/user.controller";
import { AdminTransactionController } from "./controllers/transaction.controller";
import { AdminAmlController } from "./controllers/aml.controller";
import { ReviewAmlFlagSchema } from "./dto/review-flag.dto";
import { ChangeTierSchema } from "./dto/change-tier.dto";

const router = Router();
const kycController = new AdminKYCController();
const userController = new AdminUserController();
const transactionController = new AdminTransactionController();
const amlController = new AdminAmlController();

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(requireAdmin);

// KYC Management
router.get("/kyc/pending", kycController.getPendingKYC.bind(kycController));
router.get("/kyc/all", kycController.getAllKYC.bind(kycController));
router.post(
  "/kyc/:kycId/approve",
  kycController.approveKYC.bind(kycController),
);
router.post("/kyc/:kycId/reject", kycController.rejectKYC.bind(kycController));

// User Management
router.get("/users", userController.getAllUsers.bind(userController));
router.get(
  "/users/:userId",
  userController.getUserDetails.bind(userController),
);
router.post(
  "/users/:userId/freeze",
  userController.freezeUser.bind(userController),
);
router.post(
  "/users/:userId/unfreeze",
  userController.unfreezeUser.bind(userController),
);
router.put(
  "/users/:userId/role",
  userController.changeUserRole.bind(userController),
);
/**
 * @swagger
 * /admin/users/{userId}/tier:
 *   put:
 *     summary: Change a customer's KYC tier (BASIC / VERIFIED / PREMIUM)
 *     description: |
 *       Tier drives fraud-control limits (src/config/limits.ts). Always audit
 *       logged. Promote to PREMIUM only after enhanced due diligence.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tier, reason]
 *             properties:
 *               tier:
 *                 $ref: '#/components/schemas/AccountTier'
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tier updated
 *       400:
 *         $ref: '#/components/schemas/ErrorEnvelope'
 */
router.put(
  "/users/:userId/tier",
  validate(ChangeTierSchema),
  userController.changeUserTier.bind(userController),
);

// AML / Transaction Monitoring queue
/**
 * @swagger
 * /admin/aml/summary:
 *   get:
 *     summary: AML queue summary counts for the ops dashboard
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Counts per flag status (open, underReview, escalated, dismissed, total)
 */
router.get("/aml/summary", amlController.getSummary.bind(amlController));

/**
 * @swagger
 * /admin/aml/flags:
 *   get:
 *     summary: List AML flags (ops review queue)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [OPEN, UNDER_REVIEW, DISMISSED, ESCALATED] }
 *       - in: query
 *         name: severity
 *         schema: { type: string, enum: [LOW, MEDIUM, HIGH, CRITICAL] }
 *       - in: query
 *         name: rule
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of flags
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AmlFlag'
 */
router.get("/aml/flags", amlController.listFlags.bind(amlController));

/**
 * @swagger
 * /admin/aml/flags/{flagId}:
 *   get:
 *     summary: Get a single AML flag with user context
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flagId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Flag detail
 *       404:
 *         $ref: '#/components/schemas/ErrorEnvelope'
 */
router.get("/aml/flags/:flagId", amlController.getFlag.bind(amlController));

/**
 * @swagger
 * /admin/aml/flags/{flagId}/review:
 *   post:
 *     summary: Review an AML flag (UNDER_REVIEW / DISMISSED / ESCALATED)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: flagId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [UNDER_REVIEW, DISMISSED, ESCALATED]
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Flag updated (audit trail written)
 *       404:
 *         $ref: '#/components/schemas/ErrorEnvelope'
 */
router.post(
  "/aml/flags/:flagId/review",
  validate(ReviewAmlFlagSchema),
  amlController.reviewFlag.bind(amlController),
);

// Transaction Monitoring
router.get(
  "/transactions",
  transactionController.getAllTransactions.bind(transactionController),
);
router.get(
  "/transactions/:reference",
  transactionController.getTransactionDetails.bind(transactionController),
);
router.get(
  "/stats/transactions",
  transactionController.getTransactionStats.bind(transactionController),
);

export default router;

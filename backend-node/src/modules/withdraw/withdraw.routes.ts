import { Router } from "express";
import { WithdrawController } from "./withdraw.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validation.middleware";
import { WithdrawSchema } from "./dto/withdraw.dto";
import { transactionLimiter } from "../../shared/middleware/rateLimiter";

const router = Router();
const withdrawController = new WithdrawController();

/**
 * @swagger
 * /withdraw:
 *   post:
 *     summary: Withdraw funds from wallet to bank account (Stripe Connect payout)
 *     description: |
 *       Atomically debits the wallet, records a PENDING withdrawal, then fires
 *       the Stripe payout. If Stripe fails, the wallet is automatically
 *       refunded. The `idempotencyKey` is REQUIRED (uuid).
 *     tags: [Withdraw]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - idempotencyKey
 *             properties:
 *               amount:
 *                 type: number
 *                 description: USD amount to withdraw
 *               currency:
 *                 type: string
 *                 default: usd
 *               idempotencyKey:
 *                 $ref: '#/components/schemas/IdempotencyKey'
 *     responses:
 *       200:
 *         description: Withdrawal initiated (PENDING until payout.paid webhook)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     withdrawalId: { type: string }
 *                     amount: { type: number }
 *                     status: { type: string, enum: [PENDING] }
 *                     payoutId: { type: string }
 *                     newBalance: { type: number }
 *       400:
 *         $ref: '#/components/schemas/ErrorEnvelope'
 *       502:
 *         $ref: '#/components/schemas/ErrorEnvelope'
 */
router.post(
  "/",
  authenticate,
  transactionLimiter,
  validate(WithdrawSchema),
  withdrawController.withdraw.bind(withdrawController),
);

export default router;

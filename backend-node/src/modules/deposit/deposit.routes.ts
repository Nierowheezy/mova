import { Router } from "express";
import { DepositController } from "./deposit.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validation.middleware";
import { DepositSchema } from "./dto/deposit.dto";
import { transactionLimiter } from "../../shared/middleware/rateLimiter";

const router = Router();
const depositController = new DepositController();

router.use(authenticate);

/**
 * @swagger
 * /deposit:
 *   post:
 *     summary: Fund wallet using Stripe payment method
 *     description: |
 *       RECORDS the deposit as PENDING and creates the Stripe PaymentIntent —
 *       the wallet is credited ONLY by the `payment_intent.succeeded` webhook.
 *
 *       The `idempotencyKey` is REQUIRED (uuid). Replaying the same key returns
 *       the original response and never creates a double charge.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethodId
 *               - amount
 *               - idempotencyKey
 *             properties:
 *               paymentMethodId:
 *                 type: string
 *                 description: Stripe PaymentMethod id (pm_...)
 *               amount:
 *                 type: number
 *                 description: USD amount to deposit
 *               idempotencyKey:
 *                 $ref: '#/components/schemas/IdempotencyKey'
 *     responses:
 *       200:
 *         description: Deposit recorded as PENDING (poll transaction status until SUCCESSFUL)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     depositId: { type: string, description: Transaction reference to poll }
 *                     amount: { type: number }
 *                     status: { type: string, enum: [PENDING] }
 *                     paymentIntentId: { type: string }
 *                     clientSecret: { type: string, description: Only when 3DS action required }
 *                     requiresAction: { type: boolean }
 *       400:
 *         $ref: '#/components/schemas/ErrorEnvelope'
 */
router.post(
  "/",
  authenticate,
  transactionLimiter,
  validate(DepositSchema),
  depositController.deposit.bind(depositController),
);

export default router;

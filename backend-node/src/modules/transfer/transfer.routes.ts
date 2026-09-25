import { Router } from "express";
import { TransferController } from "./transfer.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validation.middleware";
import { TransferSchema } from "./dto/transfer.dto";
import { transactionLimiter } from "../../shared/middleware/rateLimiter";

const router = Router();
const transferController = new TransferController();

router.use(authenticate);

/**
 * @swagger
 * /transfer:
 *   post:
 *     summary: Transfer funds to another wallet
 *     tags: [Transfer]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletId
 *               - amount
 *               - transactionPin
 *             properties:
 *               walletId:
 *                 type: string
 *               amount:
 *                 type: number
 *               transactionPin:
 *                 type: string
 *               saveBeneficiary:
 *                 type: boolean
 *               idempotencyKey:
 *                 type: string
 *     responses:
 *       201:
 *         description: Transfer successful
 *       400:
 *         description: Insufficient funds, invalid PIN, or other error
 */
router.post(
  "/",
  transactionLimiter,
  validate(TransferSchema),
  transferController.transfer.bind(transferController),
);

export default router;

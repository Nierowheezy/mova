import { Router } from "express";
import { WalletController } from "./wallet.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";

const router = Router();
const walletController = new WalletController();

// All wallet routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /wallet/me:
 *   get:
 *     summary: Get authenticated user's wallet details
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet details with balance and ID
 */
router.get("/me", walletController.getMyWallet.bind(walletController));

/**
 * @swagger
 * /wallet/balance:
 *   get:
 *     summary: Get current wallet balance
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance amount
 */
router.get(
  "/balance",
  walletController.getWalletBalance.bind(walletController),
);

/**
 * @swagger
 * /wallet/{walletId}:
 *   get:
 *     summary: Get public wallet info by wallet ID (for transfers)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: walletId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Wallet owner's name and KYC status
 *       404:
 *         description: Wallet not found
 */
router.get(
  "/:walletId",
  walletController.getWalletByWalletId.bind(walletController),
);

export default router;

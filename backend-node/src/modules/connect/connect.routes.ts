import { Router } from "express";
import { ConnectController } from "./connect.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";

const router = Router();
const connectController = new ConnectController();

/**
 * @swagger
 * /connect/onboard:
 *   post:
 *     summary: Create Stripe Connect account and get onboarding link
 *     tags: [Connect]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns onboarding URL
 */
router.post(
  "/onboard",
  authenticate,
  connectController.onboard.bind(connectController),
);

/**
 * @swagger
 * /connect/return:
 *   get:
 *     summary: OAuth redirect handler after Stripe onboarding
 *     tags: [Connect]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: Redirects to frontend
 */
router.get("/return", connectController.oauthRedirect.bind(connectController));

export default router;

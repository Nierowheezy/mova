import express, { Router } from "express";
import { WebhookController } from "./webhook.controller";

const router = Router();
const webhookController = new WebhookController();

/**
 * @swagger
 * /webhook/stripe:
 *   post:
 *     summary: Stripe webhook endpoint for payment events
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook received
 *       400:
 *         description: Invalid signature
 */
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  webhookController.handleStripeWebhook.bind(webhookController),
);

router.post(
  "/stripe/connect",
  express.raw({ type: "application/json" }),
  webhookController.handleStripeConnectWebhook.bind(webhookController),
);

export default router;

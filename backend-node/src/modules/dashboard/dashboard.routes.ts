import { Router } from "express";
import { DashboardController } from "./dashboard.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";

const router = Router();
const dashboardController = new DashboardController();

router.use(authenticate);

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Get dashboard overview (wallet, recent transactions, savings, notifications, beneficiaries)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: transactionLimit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Number of recent transactions to return
 *     responses:
 *       200:
 *         description: Dashboard data
 *       401:
 *         description: Unauthorized
 */
router.get("/", dashboardController.getDashboard.bind(dashboardController));

export default router;

import { Router } from "express";
import { SavingsController } from "./savings.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validation.middleware";
import { CreateGoalSchema, DepositGoalSchema, WithdrawGoalSchema } from "./dto";

const router = Router();
const savingsController = new SavingsController();

router.use(authenticate);

/**
 * @swagger
 * /savings/create:
 *   post:
 *     summary: Create a new savings goal
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - targetAmount
 *             properties:
 *               name:
 *                 type: string
 *               targetAmount:
 *                 type: number
 *               targetDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Goal created
 */
router.post(
  "/create",
  validate(CreateGoalSchema),
  savingsController.createGoal.bind(savingsController),
);

/**
 * @swagger
 * /savings/deposit:
 *   post:
 *     summary: Deposit money from wallet to a savings goal
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uuid
 *               - amount
 *             properties:
 *               uuid:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Deposit successful
 */
router.post(
  "/deposit",
  validate(DepositGoalSchema),
  savingsController.depositToGoal.bind(savingsController),
);

/**
 * @swagger
 * /savings/withdraw:
 *   post:
 *     summary: Withdraw fully from a savings goal (only when target reached)
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uuid
 *             properties:
 *               uuid:
 *                 type: string
 *     responses:
 *       200:
 *         description: Withdrawal successful
 *       400:
 *         description: Goal not reached or already empty
 */
router.post(
  "/withdraw",
  validate(WithdrawGoalSchema),
  savingsController.withdrawFromGoal.bind(savingsController),
);

/**
 * @swagger
 * /savings:
 *   get:
 *     summary: List all savings goals with progress
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of savings goals
 */
router.get("/", savingsController.listGoals.bind(savingsController));

/**
 * @swagger
 * /savings/{uuid}:
 *   get:
 *     summary: Get details of a specific savings goal including transaction history
 *     tags: [Savings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Goal details
 *       404:
 *         description: Goal not found
 */
router.get("/:uuid", savingsController.getGoalDetails.bind(savingsController));

export default router;

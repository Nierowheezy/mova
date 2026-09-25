import { Router } from "express";
import { BeneficiaryController } from "./beneficiary.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validation.middleware";
import { AddBeneficiarySchema } from "./dto/beneficiary.dto";

const router = Router();
const beneficiaryController = new BeneficiaryController();

router.use(authenticate);

/**
 * @swagger
 * /beneficiaries:
 *   get:
 *     summary: Get all beneficiaries for the authenticated user
 *     tags: [Beneficiary]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of beneficiaries
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/",
  beneficiaryController.getBeneficiaries.bind(beneficiaryController),
);

/**
 * @swagger
 * /beneficiaries:
 *   post:
 *     summary: Add a beneficiary by wallet ID
 *     tags: [Beneficiary]
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
 *             properties:
 *               walletId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Beneficiary added
 *       400:
 *         description: Invalid wallet ID
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/",
  validate(AddBeneficiarySchema),
  beneficiaryController.addBeneficiary.bind(beneficiaryController),
);

/**
 * @swagger
 * /beneficiaries/{id}:
 *   delete:
 *     summary: Remove a beneficiary
 *     tags: [Beneficiary]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Beneficiary removed
 *       404:
 *         description: Beneficiary not found
 */
router.delete(
  "/:id",
  beneficiaryController.removeBeneficiary.bind(beneficiaryController),
);

export default router;

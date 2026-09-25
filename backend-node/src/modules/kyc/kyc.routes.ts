import { Router } from "express";
import { KYCController } from "./kyc.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validation.middleware";
import { CreateKYCSchema } from "./dto/create-kyc.dto";

const router = Router();
const kycController = new KYCController();

// All KYC routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /kyc:
 *   post:
 *     summary: Submit KYC information
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - dateOfBirth
 *               - idType
 *               - idImage
 *             properties:
 *               fullName:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               idType:
 *                 type: string
 *                 enum: [NATIONAL_ID, DRIVERS_LICENSE, PASSPORT]
 *               idImage:
 *                 type: string
 *                 description: URL of uploaded ID image
 *     responses:
 *       201:
 *         description: KYC submitted successfully
 *       400:
 *         description: Validation error or duplicate submission
 */
router.post(
  "/",
  validate(CreateKYCSchema),
  kycController.createKYC.bind(kycController),
);

/**
 * @swagger
 * /kyc/profile:
 *   get:
 *     summary: Get current user's KYC profile
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC profile data
 *       404:
 *         description: KYC not found
 */
router.get("/profile", kycController.getKYC.bind(kycController));

// Access-controlled document retrieval (replaces public static file serving)
/**
 * @swagger
 * /kyc/documents/{fileName}:
 *   get:
 *     summary: Download an uploaded KYC document
 *     description: |
 *       Access-controlled: only the document owner or ADMIN/SUPPORT may read a
 *       file. Uploaded files are stored privately — never on a public static
 *       path, so PII is not exposed.
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema: { type: string }
 *         description: Opaque fileId returned by POST /upload
 *     responses:
 *       200:
 *         description: File stream (inline)
 *       403:
 *         description: Not the owner and not admin/support
 *       404:
 *         description: Not found
 */
router.get(
  "/documents/:fileName",
  kycController.downloadDocument.bind(kycController),
);

export default router;

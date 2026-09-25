import { Router } from "express";
import { UserController } from "./user.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validation.middleware";
import { ChangePasswordSchema } from "./dto/change-password.dto";

const router = Router();
const userController = new UserController();

router.use(authenticate);

/**
 * @swagger
 * /user/set-pin:
 *   post:
 *     summary: Set transaction PIN
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pin
 *             properties:
 *               pin:
 *                 type: string
 *     responses:
 *       200:
 *         description: PIN set successfully
 */
router.post("/set-pin", userController.setTransactionPin.bind(userController));

/**
 * @swagger
 * /user/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *               - confirmNewPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *               confirmNewPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed, all sessions invalidated
 *       400:
 *         description: Validation error or wrong current password
 */
router.post(
  "/change-password",
  validate(ChangePasswordSchema),
  userController.changePassword.bind(userController),
);

/**
 * @swagger
 * /user/check-password:
 *   post:
 *     summary: Check password strength without changing it
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Returns password strength analysis
 */
router.post(
  "/check-password",
  userController.checkPasswordStrength.bind(userController),
);

/**
 * @swagger
 * /user/profile:
 *   get:
 *     summary: Get current user profile (email, username, role, wallet, KYC status)
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 */
router.get("/profile", userController.getProfile.bind(userController));

// ========== 2FA ROUTES ==========
/**
 * @swagger
 * /user/2fa/enable:
 *   post:
 *     summary: Generate 2FA secret, QR code, and backup codes
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Returns secret, QR code as dataURL, backup codes
 *       400:
 *         description: 2FA already enabled or invalid password
 */
router.post("/2fa/enable", userController.enable2FA.bind(userController));

/**
 * @swagger
 * /user/2fa/verify:
 *   post:
 *     summary: Verify TOTP code and enable 2FA
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: 6‑digit TOTP code from authenticator app
 *     responses:
 *       200:
 *         description: 2FA enabled
 *       400:
 *         description: Invalid token
 */
router.post("/2fa/verify", userController.verify2FA.bind(userController));

/**
 * @swagger
 * /user/2fa/disable:
 *   post:
 *     summary: Disable 2FA after verifying password and TOTP code
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *               - token
 *             properties:
 *               password:
 *                 type: string
 *               token:
 *                 type: string
 *                 description: 6‑digit TOTP code
 *     responses:
 *       200:
 *         description: 2FA disabled
 *       400:
 *         description: Invalid password or token
 */
router.post("/2fa/disable", userController.disable2FA.bind(userController));

export default router;

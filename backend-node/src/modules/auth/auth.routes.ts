import { Router } from "express";
import { AuthController } from "./auth.controller";
import { validate } from "../../shared/middleware/validation.middleware";
import { RegisterDtoSchema, LoginDtoSchema } from "./dto";
import { authenticate } from "../../shared/middleware/auth.middleware";
import { authLimiter } from "../../shared/middleware/rateLimiter";
import { Login2FASchema } from "./dto/login-2fa.dto";

const router = Router();
const authController = new AuthController();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - confirmPassword
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error
 */
router.post(
  "/register",
  authLimiter,
  validate(RegisterDtoSchema),
  authController.register.bind(authController),
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns accessToken and sets refresh cookie
 *       401:
 *         description: Invalid credentials
 */
router.post(
  "/login",
  authLimiter,
  validate(LoginDtoSchema),
  authController.login.bind(authController),
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: New access token generated
 *       401:
 *         description: Invalid or missing refresh token
 */
router.post("/refresh", authController.refreshToken.bind(authController));

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/logout",
  authenticate,
  authController.logout.bind(authController),
);

// ========== EMAIL VERIFICATION ==========
/**
 * @swagger
 * /auth/send-verification:
 *   post:
 *     summary: Send email verification link
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification email sent
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/send-verification",
  authenticate,
  authController.sendVerificationEmail.bind(authController),
);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verify email address with token
 *     tags: [Auth]
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
 *     responses:
 *       200:
 *         description: Email verified
 *       400:
 *         description: Invalid or expired token
 */
router.post("/verify-email", authController.verifyEmail.bind(authController));

// ========== PASSWORD RESET ==========
/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reset email sent
 *       404:
 *         description: User not found
 */
router.post(
  "/forgot-password",
  authController.forgotPassword.bind(authController),
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid token or password mismatch
 */
router.post(
  "/reset-password",
  authController.resetPassword.bind(authController),
);

/**
 * @swagger
 * /auth/login/2fa:
 *   post:
 *     summary: Complete 2FA login after password step
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tempToken
 *               - twoFactorCode
 *             properties:
 *               tempToken:
 *                 type: string
 *               twoFactorCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid 2FA code
 */
router.post(
  "/login/2fa",
  validate(Login2FASchema),
  authController.login2FA.bind(authController),
);

export default router;

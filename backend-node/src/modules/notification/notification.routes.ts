import { Router } from "express";
import { NotificationController } from "./notification.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";

const router = Router();
const notificationController = new NotificationController();

// All notification routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get current user's notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: List of notifications
 */
router.get(
  "/",
  notificationController.getNotifications.bind(notificationController),
);

/**
 * @swagger
 * /notifications/read-all:
 *   post:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Count of notifications marked as read
 */
router.post(
  "/read-all",
  notificationController.markAllAsRead.bind(notificationController),
);

/**
 * @swagger
 * /notifications/{id}/read:
 *   post:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.post(
  "/:id/read",
  notificationController.markAsRead.bind(notificationController),
);

export default router;
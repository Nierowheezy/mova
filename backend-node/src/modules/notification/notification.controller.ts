import { Request, Response } from "express";
import { NotificationService } from "./notification.service";

const notificationService = new NotificationService();

export class NotificationController {
  async getNotifications(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const unreadOnly = req.query.unread === "true";
    const notifications = await notificationService.getNotifications(
      userId,
      unreadOnly,
    );

    return res.status(200).json({
      success: true,
      data: notifications,
    });
  }

  async markAsRead(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_PARAM", message: "Notification ID is required" },
      });
    }

    await notificationService.markAsRead(userId, id);

    return res.status(200).json({
      success: true,
      data: { id },
    });
  }

  async markAllAsRead(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const updated = await notificationService.markAllAsRead(userId);

    return res.status(200).json({
      success: true,
      data: { updated },
    });
  }
}
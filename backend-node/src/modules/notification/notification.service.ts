import { prisma } from "../../config/database";

export class NotificationService {
  async getNotifications(userId: number, unreadOnly = false) {
    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      include: {
        transaction: { select: { reference: true } },
      },
      orderBy: { timestamp: "desc" },
    });

    return notifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      status: n.status,
      isRead: n.isRead,
      timestamp: n.timestamp,
      txReference: n.transaction?.reference ?? null,
    }));
  }

  async markAsRead(userId: number, notificationId: number) {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });

    if (result.count === 0) {
      throw new Error("Notification not found");
    }

    return true;
  }

  async markAllAsRead(userId: number) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return result.count;
  }
}
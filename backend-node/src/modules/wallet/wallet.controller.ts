import { Request, Response } from "express";
import { WalletService } from "./wallet.service";

const walletService = new WalletService();

export class WalletController {
  async getMyWallet(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const wallet = await walletService.getMyWallet(userId);

    return res.status(200).json({
      success: true,
      data: {
        walletId: wallet.walletId,
        balance: wallet.balance,
        createdAt: wallet.createdAt,
        user: wallet.user,
      },
    });
  }

  async getWalletByWalletId(req: Request, res: Response): Promise<any> {
    const { walletId } = req.params;

    // Ensure walletId is a string (not string[])
    const walletIdStr = Array.isArray(walletId) ? walletId[0] : walletId;

    if (!walletIdStr) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_PARAM", message: "Wallet ID is required" },
      });
    }

    const wallet = await walletService.getWalletByWalletId(walletIdStr);

    return res.status(200).json({
      success: true,
      data: wallet,
    });
  }

  async getWalletBalance(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const balance = await walletService.getWalletBalance(userId);

    return res.status(200).json({
      success: true,
      data: balance,
    });
  }
}

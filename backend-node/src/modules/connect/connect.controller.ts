import { Request, Response } from "express";
import { ConnectService } from "./connect.service";

const connectService = new ConnectService();

export class ConnectController {
  async onboard(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, error: { code: "UNAUTHORIZED" } });
    }

    const refreshUrl = `${req.protocol}://${req.get("host")}/api/v1/connect/refresh`;
    const returnUrl = `${req.protocol}://${req.get("host")}/api/v1/connect/return`;

    const result = await connectService.createOnboardingLink(
      userId,
      refreshUrl,
      returnUrl,
    );

    return res.json({ success: true, data: { url: result.url } });
  }

  async oauthRedirect(req: Request, res: Response): Promise<any> {
    const { code } = req.query;
    if (!code) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/withdraw?error=missing_code`,
      );
    }
    // Process the code (optional, we can just store that onboarding is complete)
    // For simplicity, redirect to frontend success page.
    return res.redirect(`${process.env.FRONTEND_URL}/withdraw?onboarded=true`);
  }

  async refreshRedirect(_req: Request, res: Response): Promise<any> {
    // If onboarding link expires, redirect back to frontend to retry
    return res.redirect(
      `${process.env.FRONTEND_URL}/withdraw?error=session_expired`,
    );
  }
}

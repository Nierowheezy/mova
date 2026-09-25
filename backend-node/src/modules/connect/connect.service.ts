import { prisma } from "../../config/database";
import { stripe } from "../../config/stripe";

export class ConnectService {
  async createOnboardingLink(
    userId: number,
    refreshUrl: string,
    returnUrl: string,
  ) {
    // Check if user already has a Stripe account
    let user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new Error("User not found");

    let stripeAccountId = user.stripeAccountId;

    // If no Stripe account, create one
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express", // simple onboarding, no individual verification required for test
        country: "US",
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
      });
      stripeAccountId = account.id;
      await prisma.user.update({
        where: { id: userId },
        data: { stripeAccountId },
      });
    }

    // Create an Account Link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return { url: accountLink.url, stripeAccountId };
  }

  async handleOauthRedirect(code: string) {
    // Exchange code for connected account ID (if using OAuth, but we use Account Links)
    // This is optional – for Account Links we don't need OAuth exchange.
    // However, we may need to fetch the account status after onboarding.
    // For simplicity, we'll just return the code; the frontend will redirect.
    return { code };
  }
}

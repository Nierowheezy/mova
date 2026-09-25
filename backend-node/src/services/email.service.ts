import { Resend } from "resend";
import { env } from "../config/env";

const resend = new Resend(env.RESEND_API_KEY);

export const sendVerificationEmail = async (to: string, token: string) => {
  const verificationUrl = `${env.CLIENT_URL}/verify-email?token=${token}`;
  console.log(`\n📧 Attempting to send verification email to ${to}...\n`);

  const { data, error } = await resend.emails.send({
    from: env.FROM_EMAIL, // now "onboarding@resend.dev"
    to,
    subject: "Verify your email address",
    html: `<p>Click <a href="${verificationUrl}">here</a> to verify your email. This link expires in 24 hours.</p>`,
  });

  if (error) {
    console.error(`❌ Resend error:`, error);
  } else {
    console.log(`✅ Verification email sent, id: ${data?.id}`);
  }
};

export const sendPasswordResetEmail = async (to: string, token: string) => {
  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${token}`;
  console.log(`\n🔑 Attempting to send password reset email to ${to}...\n`);

  const { data, error } = await resend.emails.send({
    from: env.FROM_EMAIL,
    to,
    subject: "Reset your password",
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`,
  });

  if (error) {
    console.error(`❌ Resend error:`, error);
  } else {
    console.log(`✅ Password reset email sent, id: ${data?.id}`);
  }
};

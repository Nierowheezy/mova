import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedAdmin() {
  try {
    const adminEmail = "admin@fintech.com";
    const adminPassword = "Admin123!";
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existingAdmin) {
      const admin = await prisma.user.create({
        data: {
          email: adminEmail,
          username: "admin",
          password: hashedPassword,
          role: "ADMIN",
        },
      });

      // Create wallet for admin
      await prisma.wallet.create({
        data: {
          userId: admin.id,
          walletId: Math.floor(
            Math.random() * 9000000000 + 1000000000,
          ).toString(),
          balance: 0,
        },
      });

      console.log("✅ Admin user created:", adminEmail);
      console.log("📝 Password:", adminPassword);
    } else {
      console.log("⚠️ Admin user already exists");
    }
  } catch (error) {
    console.error("❌ Error seeding admin:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin();

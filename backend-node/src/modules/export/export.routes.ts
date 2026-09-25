import { Router } from "express";
import { ExportController } from "./export.controller";
import { authenticate } from "../../shared/middleware/auth.middleware";

const router = Router();
const exportController = new ExportController();

router.use(authenticate);

router.get(
  "/transactions",
  exportController.exportTransactions.bind(exportController),
);

export default router;

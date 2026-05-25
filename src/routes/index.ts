import { Router } from "express";
import { healthCheck } from "../controllers/health.controller";
import authRoutes from "./auth.routes";
import protectedRoutes from "./protected.routes";
import programsRoutes from "./programs.routes";
import uploadRoutes from "./upload.routes";
import application_form from "./applicationform.routes";
import visitorRoutes from "./visitor.routes";
import adminRoutes from "./admin.routes";
import paymentRoutes from './payment.routes'
import visitRoutes from "./visitor.routes";
import transactionRoutes from "./transaction.routes";
import automationRoutes from "./automation.routes";
import smsRoutes from "./sms.routes";
import transferRoutes from "./transfer.routes";
import rollnumberRoutes from "./rollnumber.routes";

const router = Router();

router.get("/health", healthCheck);
router.use("/visits", visitRoutes);
router.use("/auth", authRoutes);
router.use("/secure", paymentRoutes)
router.use("/application_form", application_form);
router.use("/admin", adminRoutes);
router.use("/protected", protectedRoutes);
router.use("/programs", programsRoutes);
router.use("/docs/upload", uploadRoutes);
router.use("/visitor", visitorRoutes);
router.use("/transactions", transactionRoutes);
router.use("/automation", automationRoutes);
router.use("/sms-templates", smsRoutes);
router.use("/transfer", transferRoutes);
router.use("/admin/rollnumber", rollnumberRoutes);
export default router;

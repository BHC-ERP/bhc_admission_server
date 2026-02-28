import { Router } from "express";
import { healthCheck } from "../controllers/health.controller";
import authRoutes from "./auth.routes";
import protectedRoutes from "./protected.routes";
import programsRoutes from "./programs.routes";
import uploadRoutes from "./upload.routes";
import application_form from "./applicationform.routes";
import visitorRoutes from "./visitor.routes";
const router = Router();

router.get("/health", healthCheck);

router.use("/auth", authRoutes);
router.use("/application_form", application_form);
router.use("/protected", protectedRoutes);
router.use("/programs", programsRoutes);
router.use("/docs/upload", uploadRoutes);
router.use("/visitor", visitorRoutes);
export default router;

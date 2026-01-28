import { Router } from "express";
import { healthCheck } from "../controllers/health.controller";
import authRoutes from "./auth.routes";
import protectedRoutes from "./protected.routes";

const router = Router();

router.get("/health", healthCheck);

router.use("/auth", authRoutes);
router.use("/protected", protectedRoutes);

export default router;

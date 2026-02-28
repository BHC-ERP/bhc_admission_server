import { Router } from "express";
import { trackVisit, getVisitorStats } from "../controllers/visitor.controller";

const router = Router();

router.post("/track", trackVisit);
router.get("/stats", getVisitorStats);

export default router;
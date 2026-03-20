import { Router } from "express";
import { trackVisit } from "../controllers/trackVisit";
import { getVisitorStats } from "../controllers/getVisitorStats";

const router = Router();

// POST /api/visits/track
router.post("/track", trackVisit);

// GET /api/visits/stats
router.get("/stats", getVisitorStats);

export default router;
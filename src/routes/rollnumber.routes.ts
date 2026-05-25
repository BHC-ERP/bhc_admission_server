import { Router } from "express";
import { getProgramSections, saveRollNumbers } from "../controllers/admin/rollnumber.controller";

const router = Router();

router.get("/programs/:programCode/sections", getProgramSections);
router.post("/save", saveRollNumbers);

export default router;

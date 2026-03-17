import { Router } from "express";
import programsModel from "../models/programs.model";
import {
  getProgramEligibility,
  updateProgramEligibility
} from "../controllers/programs/programs.controller";

const router = Router();

router.get("/", async (req, res) => {
  const programs = await programsModel
    .find({ show: true })
    .select("program_code program_name program_type type department_code department_name stream eligibility_description eligibility_subjects  special show cutoff")
    .sort({ program_name: 1 })
    .lean();

  return res.json({
    count: programs.length,
    programs
  });
});

// Program Eligibility details - GET and UPDATE by program_code and stream
router.get("/hod/:program_code/:stream/eligibility", getProgramEligibility);
router.put("/hod/:program_code/:stream/eligibility", updateProgramEligibility);

export default router;
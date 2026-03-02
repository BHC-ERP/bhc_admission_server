import { Router } from "express";
import programsModel from "../models/programs.model";

const router = Router();

router.get("/", async (req, res) => {
  const programs = await programsModel
    .find({ show: true })
    .select("program_code program_name program_type type department_code department_name stream eligibility_description eligibility_subjects  special show")
    .sort({ program_name: 1 })
    .lean();

  return res.json({
    count: programs.length,
    programs
  });
});


export default router;
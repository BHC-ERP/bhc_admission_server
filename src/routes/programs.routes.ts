import { Router } from "express";
import programsModel from "../models/programs.model";

const router = Router();

router.get("/", async (req, res) => {
  const programs = await programsModel
    .find({ show: true })
    .select("program_code program_name program_type type stream show")
    .sort({ program_name: 1 })
    .lean();

  return res.json({
    count: programs.length,
    programs
  });
});


export default router;
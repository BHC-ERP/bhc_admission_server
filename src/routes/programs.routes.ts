import { Router } from "express";
import programsModel from "../models/programs.model";
import {
  getProgramEligibility,
  updateProgramEligibility
} from "../controllers/programs/programs.controller";
import departmentVisibilityModel from "../models/departmentVisibility.model";

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

// Get department visibility mapping
router.get("/visibility", async (req, res) => {
  try {
    const visibility = await departmentVisibilityModel.find().lean();
    // Convert array to Record<string, any>
    const mapping = visibility.reduce((acc: any, curr: any) => {
      acc[curr.department_code] = {
        allowed_departments: curr.allowed_departments,
        max_percentage: curr.max_percentage || null
      };
      return acc;
    }, {});
    
    return res.json({
      success: true,
      data: mapping
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching visibility" });
  }
});

// Update department visibility mapping
router.post("/visibility", async (req, res) => {
  const { department_code, allowed_departments, max_percentage } = req.body;
  try {
    const updated = await departmentVisibilityModel.findOneAndUpdate(
      { department_code },
      { allowed_departments, max_percentage },
      { upsert: true, new: true }
    );
    return res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error updating visibility" });
  }
});

// Delete department visibility mapping
router.delete("/visibility/:department_code", async (req, res) => {
  try {
    await departmentVisibilityModel.findOneAndDelete({ department_code: req.params.department_code });
    return res.json({
      success: true,
      message: "Visibility mapping deleted"
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error deleting visibility" });
  }
});

// Program Eligibility details - GET and UPDATE by program_code and stream
router.get("/hod/:program_code/:stream/eligibility", getProgramEligibility);
router.put("/hod/:program_code/:stream/eligibility", updateProgramEligibility);

export default router;
import { Request, Response } from "express";
import * as enrolledService from "../../services/enrolledStudent.service";

export const bulkMigrate = async (req: Request, res: Response) => {
  try {
    const result = await enrolledService.migrateAllAdmittedCandidates();
    return res.status(200).json({
      success: true,
      message: `Migrated ${result.migrated} students, skipped ${result.skipped} existing.`,
      ...result,
    });
  } catch (error: any) {
    console.error("Error in bulk migrate:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during migration",
      error: error.message,
    });
  }
};

export const listEnrolled = async (req: Request, res: Response) => {
  try {
    const { stream, shift, program_code } = req.query;
    const filter: any = {};
    if (stream) filter.stream = stream;
    if (shift) filter.shift = shift;
    if (program_code) filter["current_academic.program_code"] = program_code;

    const data = await enrolledService.getEnrolledStudents(filter);
    return res.status(200).json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error: any) {
    console.error("Error listing enrolled students:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching enrolled students",
      error: error.message,
    });
  }
};

export const saveRollNumbers = async (req: Request, res: Response) => {
  try {
    const { rollNumbers } = req.body;

    if (!rollNumbers || !Array.isArray(rollNumbers) || rollNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "rollNumbers array is required and must not be empty",
      });
    }

    const result = await enrolledService.saveRollNumbers(rollNumbers);

    return res.status(200).json({
      success: true,
      message: `Updated ${result.modified} roll numbers across ${result.matched} students.`,
      ...result,
    });
  } catch (error: any) {
    console.error("Error saving roll numbers:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving roll numbers",
      error: error.message,
    });
  }
};

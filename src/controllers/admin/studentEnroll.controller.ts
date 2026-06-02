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
    const { stream, shift, program_code, search } = req.query;
    const filter: any = {};
    if (stream) filter.stream = stream;
    if (shift) filter.shift = shift;
    if (program_code) filter["current_academic.program_code"] = program_code;
    
    if (search) {
      const searchRegex = new RegExp(search as string, "i");
      const searchNum = Number(search);
      const searchConditions: any[] = [{ name: searchRegex }];
      if (!isNaN(searchNum)) {
        searchConditions.push(
          { roll_no: searchNum },
          { application_no: searchNum },
          { registration_number: searchNum }
        );
      }
      filter.$or = searchConditions;
    }

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

export const updateStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    delete data._id;

    const updated = await enrolledService.updateStudentById(id as string, data);
    
    if (!updated) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Student details updated successfully",
      data: updated,
    });
  } catch (error: any) {
    console.error("Error updating student:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating student",
      error: error.message,
    });
  }
};
  
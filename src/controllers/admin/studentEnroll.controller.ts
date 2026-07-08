import { Request, Response } from "express";
import * as enrolledService from "../../services/enrolledStudent.service";
import EditLog from "../../models/audit/EditLog.model";
import { getChangedData } from "../../utils/diffHelper";

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
    const { rollNumbers, staffname, staffid } = req.body;

    if (!rollNumbers || !Array.isArray(rollNumbers) || rollNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "rollNumbers array is required and must not be empty",
      });
    }

    const result = await enrolledService.saveRollNumbers(rollNumbers);

    const staff_id_val = staffid || (req as any).user?.id || 'admin';
    const staff_name_val = staffname || (req as any).user?.name || (req as any).user?.fullName || 'Administrator';

    for (const change of result.changes) {
      const { old: oldDoc, new: newDoc } = change;
      const { oldDiff, newDiff, hasChanges } = getChangedData(oldDoc, newDoc);

      if (hasChanges) {
        await EditLog.create({
          registration_number: oldDoc.registration_number ?? 0,
          roll_no: oldDoc.roll_no ?? 0,
          staff_id: staff_id_val,
          staff_name: staff_name_val,
          section_edited: "Roll Numbers / Section / Shift",
          old_data: oldDiff,
          new_data: newDiff,
          ip_address: req.ip || req.socket.remoteAddress,
          user_agent: req.get("user-agent") || "Unknown"
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Updated ${result.modified} roll numbers across ${result.matched} students.`,
      matched: result.matched,
      modified: result.modified,
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
    const { staffname, staffid, ...data } = req.body;
    
    delete data._id;

    const result = await enrolledService.updateStudentById(id as string, data);

    if (!result) {
      // Student not found in enrolledstudents — fall back to heber-erp.students using roll_no
      if (data.roll_no) {
        await enrolledService.syncStudentToHeberByRollNo(data.roll_no, data);
        return res.status(200).json({
          success: true,
          message: "Student updated in records collection",
          data: null,
        });
      }
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const { old: oldDoc, new: newDoc } = result;

    const { oldDiff, newDiff, hasChanges } = getChangedData(oldDoc, data);

    if (hasChanges) {
      await EditLog.create({
        registration_number: oldDoc.registration_number ?? 0,
        roll_no :oldDoc.roll_no ?? 0,
        staff_id: staffid || (req as any).user?.id || 'admin',
        staff_name: staffname || (req as any).user?.name || (req as any).user?.fullName || 'Administrator',
        section_edited: "Student Details",
        old_data: oldDiff,
        new_data: newDiff,
        ip_address: req.ip || req.socket.remoteAddress,
        user_agent: req.get("user-agent") || "Unknown"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Student details updated successfully",
      data: newDoc,
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
  
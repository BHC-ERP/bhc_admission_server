import { Request, Response } from "express";
import mongoose from "mongoose";
import CandidateAdmission from "../../models/candidate.model";
import programsModel from "../../models/programs.model";

export const getProgramSections = async (req: Request, res: Response) => {
  try {
    const { programCode } = req.params;

    const program = await programsModel
      .findOne({ program_code: programCode })
      .select("program_code program_name sections")
      .lean();

    if (!program) {
      return res.status(404).json({
        success: false,
        message: "Program not found"
      });
    }

    const sections = (program as any).sections || [];

    return res.status(200).json({
      success: true,
      program_code: program.program_code,
      program_name: (program as any).program_name,
      sections
    });
  } catch (error: any) {
    console.error("Error fetching program sections:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching program sections",
      error: error.message
    });
  }
};

export const saveRollNumbers = async (req: Request, res: Response) => {
  try {
    const { rollNumbers } = req.body;

    if (!rollNumbers || !Array.isArray(rollNumbers) || rollNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "rollNumbers array is required and must not be empty"
      });
    }

    const bulkOps: mongoose.mongo.AnyBulkWriteOperation[] = [];

    for (const item of rollNumbers) {
      const { registration_number, roll_number, section } = item;

      if (!registration_number || !roll_number) {
        continue;
      }

      bulkOps.push({
        updateOne: {
          filter: { registration_number: Number(registration_number) },
          update: {
            $set: {
              roll_number: roll_number,
              section: section || "",
              "application_preferences.applications.$[elem].admission_details.roll_number": roll_number,
              "application_preferences.applications.$[elem].admission_details.section": section || ""
            }
          },
          arrayFilters: [{ "elem.status": "ADMITTED" }]
        }
      });
    }

    if (bulkOps.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No valid records to update.",
        modifiedCount: 0
      });
    }

    const result = await CandidateAdmission.bulkWrite(bulkOps, { ordered: false });

    return res.status(200).json({
      success: true,
      message: `Successfully updated ${result.modifiedCount} candidates with roll numbers.`,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });
  } catch (error: any) {
    console.error("Error saving roll numbers:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving roll numbers",
      error: error.message
    });
  }
};

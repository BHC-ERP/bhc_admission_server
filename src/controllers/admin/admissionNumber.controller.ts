import { Request, Response } from "express";
import CandidateAdmission from "../../models/candidate.model";
import EnrolledStudent from "../../models/enrolledStudent.model";

export const fetchAdmittedCandidates = async (req: Request, res: Response) => {
  try {
    const { academic_year, stream } = req.query;

    const query: any = {};
    const elemMatch: any = { status: "ADMITTED" };

    if (stream) {
      elemMatch.stream = stream;
    }

    query["application_preferences.applications"] = { $elemMatch: elemMatch };

    if (academic_year) {
      query.academic_year = academic_year;
    }

    const candidates = await CandidateAdmission.find(query).lean();

    return res.status(200).json({
      success: true,
      total: candidates.length,
      data: candidates
    });
  } catch (error: any) {
    console.error("Error fetching admitted candidates:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching admitted candidates",
      error: error.message
    });
  }
};

export const saveAdmissionNumbers = async (req: Request, res: Response) => {
  try {
    const { admissionNumbers } = req.body;

    if (!admissionNumbers || !Array.isArray(admissionNumbers) || admissionNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "admissionNumbers array is required and must not be empty"
      });
    }

    let matched = 0;
    let modified = 0;
    let created = 0;
    const errors: any[] = [];

    for (const item of admissionNumbers) {
      const { application_number, admission_number } = item;

      if (!application_number || !admission_number) {
        errors.push({ application_number, reason: "Missing application_number or admission_number" });
        continue;
      }

      const admissionNoNum = Number(admission_number);
      if (isNaN(admissionNoNum)) {
        errors.push({ application_number, reason: `Invalid admission_number: ${admission_number}` });
        continue;
      }

      const existing = await EnrolledStudent.findOne({ application_no: application_number });

      if (existing) {
        const result = await EnrolledStudent.updateOne(
          { application_no: application_number },
          { $set: { admission_number: admissionNoNum } }
        );
        if (result.matchedCount > 0) matched++;
        if (result.modifiedCount > 0) modified++;
      } else {
        await EnrolledStudent.create({
          application_no: application_number,
          admission_number: admissionNoNum
        });
        created++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Updated ${modified} existing, created ${created} new admission number records.`,
      matchedCount: matched,
      modifiedCount: modified,
      createdCount: created,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error("Error saving admission numbers:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving admission numbers",
      error: error.message
    });
  }
};

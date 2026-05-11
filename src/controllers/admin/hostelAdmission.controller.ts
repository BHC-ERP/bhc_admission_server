import { Request, Response } from "express";
import CandidateAdmission from "../../models/candidate.model";
import HostelSelection from "../../models/hostelSelection.model";

/**
 * @route GET /api/admin/hostel/required-list
 * @desc Get admitted candidates who requested hostel
 * @access Admin
 */
export const getHostelRequiredAdmittedList = async (req: Request, res: Response) => {
    try {
        const academic_year = "2026-2027";

        const candidates = await CandidateAdmission.aggregate([
            { 
                $match: { 
                    academic_year, 
                    "category_and_facilities.facilities.hostel.required": true 
                } 
            },
            { $unwind: "$application_preferences.applications" },
            { 
                $match: { 
                    "application_preferences.applications.status": "ADMITTED" 
                } 
            },
            {
                $lookup: {
                    from: "hostel_selections",
                    localField: "application_preferences.applications.application_number",
                    foreignField: "application_number",
                    as: "hostel_info"
                }
            },
            {
                $project: {
                    fullName: "$personal_details.fullName",
                    registration_number: 1,
                    application_number: "$application_preferences.applications.application_number",
                    program_name: "$application_preferences.applications.program_name",
                    gender: "$personal_details.gender",
                    phone: "$personal_details.phone",
                    community: "$personal_details.community",
                    hostel_status: { $ifNull: [{ $arrayElemAt: ["$hostel_info.status", 0] }, "PENDING"] }
                }
            }
        ]);

        return res.json({
            success: true,
            data: candidates
        });
    } catch (error) {
        console.error("Hostel Required List Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * @route POST /api/admin/hostel/select
 * @desc Select a candidate for hostel
 * @access Admin
 */
export const selectCandidateForHostel = async (req: Request, res: Response) => {
    try {
        const { registration_number, application_number, hostel_id, room_type, selected_by } = req.body;
        const academic_year = "2026-2027";

        const selection = await HostelSelection.findOneAndUpdate(
            { application_number },
            {
                registration_number,
                application_number,
                hostel_id,
                room_type,
                status: 'SELECTED',
                selected_at: new Date(),
                selected_by, // contains staff_id, staff_name, department, stream
                academic_year
            },
            { upsert: true, new: true }
        );

        return res.json({
            success: true,
            message: "Candidate selected for hostel",
            data: selection
        });
    } catch (error) {
        console.error("Hostel Selection Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

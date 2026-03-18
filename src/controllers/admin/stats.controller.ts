import { Request, Response } from "express";
import CandidateAdmission from "../../models/candidate.model";

export const getApplicationStats = async (req: Request, res: Response) => {
    try {
        const { programmeType = "UG" } = req.query;

        /* =========================
           TOTAL APPLICATIONS
        ========================= */ 

        const totalApplicationsAgg = await CandidateAdmission.aggregate([
            {
                $match: {
                    appliedProgrammeType: programmeType
                }
            },
            {
                $project: {
                    appCount: {
                        $size: {
                            $ifNull: ["$application_preferences.applications", []]
                        }
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$appCount" }
                }
            }
        ]);

        const totalApplications = totalApplicationsAgg[0]?.total || 0;
        /* =========================
           PAID APPLICATIONS
        ========================= */
        const paidApplications = await CandidateAdmission.countDocuments({
            appliedProgrammeType: programmeType,
            payment: {
                $elemMatch: { status: "success" }
            }
        });

        /* =========================
           FREE APPLICATIONS
           (No successful payment)
        ========================= */
        const freeApplications = await CandidateAdmission.countDocuments({
            appliedProgrammeType: programmeType,
            payment: { $not: { $elemMatch: { status: "success" } } }
        });

        /* =========================
           REGISTERED
           (submitted_at exists)
        ========================= */
        const registered = await CandidateAdmission.countDocuments({
            appliedProgrammeType: programmeType,
            "metadata.submitted_at": { $exists: true }
        });

        /* =========================
           MARK ENTERED
           (12th marks available)
        ========================= */
        const marksEntered = await CandidateAdmission.countDocuments({
            appliedProgrammeType: programmeType,
            "academic_background.school_education.twelfth.marks.percentage": { $gt: 0 }
        });

        /* =========================
           COURSE-WISE COUNT
        ========================= */
        const courseWise = await CandidateAdmission.aggregate([
            {
                $match: {
                    appliedProgrammeType: programmeType
                }
            },
            { $unwind: "$application_preferences.applications" },
            {
                $group: {
                    _id: "$application_preferences.applications.program_name",
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    course: "$_id",
                    count: 1
                }
            },
            { $sort: { count: -1 } }
        ]);

        /* =========================
           RESPONSE
        ========================= */
        return res.json({
            success: true,
            data: {
                totalApplications,
                paidApplications,
                freeApplications,
                registered,
                marksEntered,
                courseWise
            }
        });

    } catch (error) {
        console.error("Dashboard Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};
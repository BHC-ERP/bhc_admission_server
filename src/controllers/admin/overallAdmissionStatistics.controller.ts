import { Request, Response } from "express";
import mongoose from "mongoose";
import CandidateAdmission from "../../models/candidate.model";
import programsModel from "../../models/programs.model";

/**
 * @route GET /api/admin/dashboard/overall-admission-statistics
 * @desc Get overall admission statistics grouped by program and stream
 * @access Admin
 */
export const getOverallAdmissionStatistics = async (req: Request, res: Response) => {
    try {
        const academic_year = "2026-2027";

        // 1. Get all programs to ensure we cover everything
        const programs = await programsModel.find({ show: true }).lean();

        // 2. Aggregate from candidateadmissions
        const candidateStats = await CandidateAdmission.aggregate([
            { $match: { academic_year, "admission_status.current": { $ne: "Draft" } } },
            { $unwind: "$application_preferences.applications" },
            {
                $group: {
                    _id: {
                        program_code: "$application_preferences.applications.program_code",
                        stream: "$application_preferences.applications.stream",
                        shift: { $ifNull: ["$application_preferences.applications.shift", "Shift-1"] }
                    },

                    hod_selection_apps: {
                        $addToSet: {
                            $cond: [
                                { $in: ["$application_preferences.applications.status", ["HOD_SELECTION", "HOD_SELECTION_INTERVIEW"]] },
                                "$application_preferences.applications.application_number",
                                "$$REMOVE"
                            ]
                        }
                    },
                    verified_apps: {
                        $addToSet: {
                            $cond: [
                                { $eq: ["$application_preferences.applications.status", "VERIFIED"] },
                                "$application_preferences.applications.application_number",
                                "$$REMOVE"
                            ]
                        }
                    },
                    admitted_apps: {
                        $addToSet: {
                            $cond: [
                                { $in: ["$application_preferences.applications.status", ["ADMITTED", "ADMIT_FINAL", "ADMIT"]] },
                                "$application_preferences.applications.application_number",
                                "$$REMOVE"
                            ]
                        }
                    }
                }
            }
        ]);

        // 2b. Aggregate applied apps from candidate admissions
        const appliedStats = await CandidateAdmission.aggregate([
            { $match: { academic_year, "admission_status.current": { $ne: "Draft" } } },
            { $unwind: "$application_preferences.applications" },
            {
                $group: {
                    _id: {
                        program_code: "$application_preferences.applications.program_code",
                        stream: "$application_preferences.applications.stream",
                        shift: { $ifNull: ["$application_preferences.applications.shift", "Shift-1"] }
                    },
                    applied_apps: { $addToSet: "$application_preferences.applications.application_number" }
                }
            }
        ]);

        // 3. Aggregate from candidate_fees_master
        const admission2026Db = mongoose.connection.useDb("admission2026");
        const feesMasterColl = admission2026Db.collection("candidate_fees_master");

        const feesMasterStats = await feesMasterColl.aggregate([
            { $match: { academic_year } },
            {
                $group: {
                    _id: {
                        program_code: "$program_code",
                        stream: "$stream",
                        shift: { $ifNull: ["$shift", "Shift-1"] }
                    },
                    interview_sms_apps: {
                        $addToSet: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$status", "PENDING"] },
                                        { $eq: ["$is_payment_enabled", false] }
                                    ]
                                },
                                "$application_number",
                                "$$REMOVE"
                            ]
                        }
                    },
                    payment_sms_apps: {
                        $addToSet: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$status", "PENDING"] },
                                        { $eq: ["$is_payment_enabled", true] }
                                    ]
                                },
                                "$application_number",
                                "$$REMOVE"
                            ]
                        }
                    },
                    paid_admitted_apps: {
                        $addToSet: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$status", "SUCCESS"] },
                                        { $eq: ["$is_payment_enabled", true] }
                                    ]
                                },
                                "$application_number",
                                "$$REMOVE"
                            ]
                        }
                    }
                }
            }
        ]).toArray();


        // 3a. Aggregate SMS sent apps from candidate admissions
        const smsSentStats = await CandidateAdmission.aggregate([
            { $match: { academic_year, "admission_status.current": { $ne: "Draft" } } },
            { $unwind: "$application_preferences.applications" },
            {
                $match: {
                    "application_preferences.applications.sms_history": { $exists: true, $ne: [] }
                }
            },
            {
                $group: {
                    _id: {
                        program_code: "$application_preferences.applications.program_code",
                        stream: "$application_preferences.applications.stream",
                        shift: { $ifNull: ["$application_preferences.applications.shift", "Shift-1"] }
                    },
                    sms_sent_apps: { $addToSet: "$application_preferences.applications.application_number" }
                }
            }
        ]);
        // 4. Combine results into a unified map
        const programMap: Record<string, any> = {};

        // Initialize with program info
        programs.forEach((p: any) => {
            const shift = p.shift || "Shift-1";
            const key = `${p.program_code}_${p.stream}_${shift}`;
            if (!programMap[key]) {
                programMap[key] = {
                    program_name: p.program_name,
                    program_code: p.program_code,
                    stream: p.stream,
                    shift: shift,
                    department: p.department_name,
                    sanctioned_strength: p.sanctioned_strength || 0,
                    applied_set: new Set(),
                    hod_selection_set: new Set(),
                    verified_set: new Set(),
                    interview_sms_set: new Set(),
                    sms_sent_set: new Set(),
                    admitted_set: new Set()
                };
            }
        });

        // Add candidate stats
        candidateStats.forEach(stat => {
            const key = `${stat._id.program_code}_${stat._id.stream}_${stat._id.shift}`;
            if (programMap[key]) {
                stat.hod_selection_apps.forEach((app: any) => programMap[key].hod_selection_set.add(app));
                stat.verified_apps.forEach((app: any) => programMap[key].verified_set.add(app));
                stat.admitted_apps.forEach((app: any) => programMap[key].admitted_set.add(app));
            }
        });

        // Add SMS sent stats
        smsSentStats.forEach(stat => {
            const key = `${stat._id.program_code}_${stat._id.stream}_${stat._id.shift}`;
            if (programMap[key]) {
                stat.sms_sent_apps.forEach((app: any) => programMap[key].sms_sent_set.add(app));
            }
        });

        // Add applied stats
        appliedStats.forEach(stat => {
            const key = `${stat._id.program_code}_${stat._id.stream}_${stat._id.shift}`;
            if (programMap[key]) {
                stat.applied_apps.forEach((app: any) => programMap[key].applied_set.add(app));
            }
        });

        // Add fees master stats
        feesMasterStats.forEach(stat => {
            const key = `${stat._id.program_code}_${stat._id.stream}_${stat._id.shift}`;
            if (programMap[key]) {
                stat.interview_sms_apps.forEach((app: any) => programMap[key].interview_sms_set.add(app));
                // stat.payment_sms_apps.forEach((app: any) => programMap[key].sms_sent_set.add(app));
                stat.paid_admitted_apps.forEach((app: any) => programMap[key].admitted_set.add(app));
            }
        });

        // Convert sets to counts and format result
        const result = Object.values(programMap).map(p => {
            const admittedCount = p.admitted_set.size;
            const sanctioned = p.sanctioned_strength;
            return {
                program_name: p.program_name,
                program_code: p.program_code,
                stream: p.stream,
                shift: p.shift,
                department: p.department,
                sanctioned_strength: sanctioned,
                applied: p.applied_set.size,
                hod_selection: p.hod_selection_set.size,
                verified: p.verified_set.size,
                interview_sms: p.interview_sms_set.size,
                sms_sent: p.sms_sent_set.size,
                admitted: admittedCount,
                seats_left: Math.max(0, sanctioned - admittedCount)
            };
        }).sort((a: any, b: any) =>
            a.program_name.localeCompare(b.program_name) || a.shift.localeCompare(b.shift)
        );

        return res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error("Overall Admission Statistics Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

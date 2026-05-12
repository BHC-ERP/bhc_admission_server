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

        // 1. Prepare independent queries to run concurrently
        const programsPromise = programsModel.find({ show: true }).sort({ program_name: 1, stream: 1, shift: 1 }).lean();

        // 2. Aggregate from candidateadmissions
        const candidateStatsPromise = CandidateAdmission.aggregate([
            { $match: { academic_year } },
            { $unwind: "$application_preferences.applications" },
            { $match: { "application_preferences.applications.status": { $ne: "Draft" } } },
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

        // 2b. Aggregate applied & draft apps from candidate admissions
        const appliedStatsPromise = CandidateAdmission.aggregate([
            { $match: { academic_year } },
            { $unwind: "$application_preferences.applications" },
            {
                $group: {
                    _id: {
                        program_code: "$application_preferences.applications.program_code",
                        stream: "$application_preferences.applications.stream",
                        shift: { $ifNull: ["$application_preferences.applications.shift", "Shift-1"] }
                    },
                    applied_apps: {
                        $addToSet: {
                            $cond: [
                                { $ne: ["$application_preferences.applications.status", "Draft"] },
                                "$application_preferences.applications.application_number",
                                "$$REMOVE"
                            ]
                        }
                    },
                    draft_apps: {
                        $addToSet: {
                            $cond: [
                                { $eq: ["$application_preferences.applications.status", "Draft"] },
                                "$application_preferences.applications.application_number",
                                "$$REMOVE"
                            ]
                        }
                    }
                }
            }
        ]);

        // 3. Get successful application numbers from fee_collection DB
        const feeCollectionDb = mongoose.connection.useDb("fee_collection");
        const admissionFeesPromise = feeCollectionDb.collection("admission_fees").distinct("application_number", {
            status: { $in: ["SWIPE_RECORDED", "SWIPE_PAID", "SUCCESS"] }
        });
        const swipePaymentsPromise = feeCollectionDb.collection("swipepayments").distinct("application_number", {
            status: { $in: ["SWIPE_RECORDED", "SWIPE_PAID", "SUCCESS"] }
        });

        // 3a. Redesigned SMS sent stats
        const smsSentStatsPromise = CandidateAdmission.aggregate([
            { $match: { academic_year } },
            { $unwind: "$application_preferences.applications" },
            { $match: { "application_preferences.applications.status": { $ne: "Draft" } } },
            { $unwind: "$application_preferences.applications.sms_history" },
            {
                $group: {
                    _id: {
                        program_code: "$application_preferences.applications.program_code",
                        stream: "$application_preferences.applications.stream",
                        shift: { $ifNull: ["$application_preferences.applications.shift", "Shift-1"] }
                    },
                    payment_sms_count: {
                        $sum: {
                            $cond: [
                                { $in: ["$application_preferences.applications.sms_history.template_identifier", ["fee_sms", "admission_spot"]] },
                                1,
                                0
                            ]
                        }
                    },
                    interview_sms_count: {
                        $sum: {
                            $cond: [
                                { $in: ["$application_preferences.applications.sms_history.template_identifier", ["others_interview", "mba_mca", "ug_interview"]] },
                                1,
                                0
                            ]
                        }
                    },
                    hostel_sms_count: {
                        $sum: {
                            $cond: [
                                { $eq: ["$application_preferences.applications.sms_history.template_identifier", "hostel_admission_sms"] },
                                1,
                                0
                            ]
                        }
                    },
                    other_sms_count: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $not: { $in: ["$application_preferences.applications.sms_history.template_identifier", ["others_interview", "mba_mca", "ug_interview", "fee_sms", "admission_spot", "hostel_admission_sms"]] } },
                                        { $ne: ["$application_preferences.applications.sms_history.template_identifier", null] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    payment_sms_count: 1,
                    interview_sms_count: 1,
                    hostel_sms_count: 1,
                    other_sms_count: 1
                }
            }
        ]);

        // Wait for all independent queries
        const [
            programs,
            candidateStats,
            appliedStats,
            admissionFees,
            swipePayments,
            smsSentStats
        ] = await Promise.all([
            programsPromise,
            candidateStatsPromise,
            appliedStatsPromise,
            admissionFeesPromise,
            swipePaymentsPromise,
            smsSentStatsPromise
        ]);

        const paidAppNumbers = new Set([
            ...admissionFees.map(val => Number(val)),
            ...swipePayments.map(val => Number(val))
        ].filter(val => val && !isNaN(val)));

        // 3b. Lookup metadata (program, stream, shift) from candidate_fees_master for these paid applications
        const admission2026Db = mongoose.connection.useDb("admission2026");
        const paidAppArray = Array.from(paidAppNumbers);
        const paidMetadata = await admission2026Db.collection("candidate_fees_master").find(
            {
                $or: [
                    { application_number: { $in: paidAppArray } },
                    { application_number: { $in: paidAppArray.map(String) } }
                ]
            },
            { projection: { application_number: 1, program_code: 1, stream: 1, shift: 1 } }
        ).toArray();

        // Group paid counts by the metadata from fees master
        const paidStatsMap: Record<string, Set<number>> = {};
        paidMetadata.forEach(m => {
            const shift = m.shift || "Shift-1";
            const key = `${m.program_code}_${m.stream}_${shift}`;
            if (!paidStatsMap[key]) paidStatsMap[key] = new Set();
            paidStatsMap[key].add(m.application_number);
        });

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
                    draft_set: new Set(),
                    hod_selection_set: new Set(),
                    verified_set: new Set(),
                    interview_sms_count: 0,
                    sms_sent_count: 0,
                    hostel_sms_count: 0,
                    other_sms_count: 0,
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
            }
        });

        // Add Paid stats from the fees master lookup
        Object.entries(paidStatsMap).forEach(([key, appNumbers]) => {
            if (programMap[key]) {
                appNumbers.forEach(app => programMap[key].admitted_set.add(app));
            }
        });

        // Add SMS sent stats
        smsSentStats.forEach(stat => {
            const key = `${stat._id.program_code}_${stat._id.stream}_${stat._id.shift}`;
            if (programMap[key]) {
                programMap[key].sms_sent_count += stat.payment_sms_count || 0;
                programMap[key].interview_sms_count += stat.interview_sms_count || 0;
                programMap[key].hostel_sms_count += stat.hostel_sms_count || 0;
                programMap[key].other_sms_count += stat.other_sms_count || 0;
            }
        });

        // Add applied & draft stats
        appliedStats.forEach(stat => {
            const key = `${stat._id.program_code}_${stat._id.stream}_${stat._id.shift}`;
            if (programMap[key]) {
                if (stat.applied_apps) {
                    stat.applied_apps.forEach((app: any) => programMap[key].applied_set.add(app));
                }
                if (stat.draft_apps) {
                    stat.draft_apps.forEach((app: any) => programMap[key].draft_set.add(app));
                }
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
                draft: p.draft_set.size,
                total_applied: p.applied_set.size + p.draft_set.size,
                hod_selection: p.hod_selection_set.size,
                verified: p.verified_set.size,
                interview_sms: p.interview_sms_count,
                sms_sent: p.sms_sent_count,
                hostel_sms: p.hostel_sms_count,
                others_sms: p.other_sms_count,
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


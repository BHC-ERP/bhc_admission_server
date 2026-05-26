import { Request, Response } from "express";
import mongoose from "mongoose";
import CandidateAdmission from "../../models/candidate.model";
import programsModel from "../../models/programs.model";

/**
 * @route GET /api/admin/dashboard/overall-admission-statistics
 * @desc Get overall admission statistics grouped by program and stream
 * @access Admin
 */
export const
    getOverallAdmissionStatistics = async (req: Request, res: Response) => {
        try {
            const academic_year = "2026-2027";
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const ADMITTED_STATUSES = ["admitted", "admit_final", "admit"];

            const admission2026Db = mongoose.connection.useDb("admission2026");

            // 1. Prepare independent queries to run concurrently

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
                                    { $in: [{ $toLower: "$application_preferences.applications.status" }, ["hod_selection", "hod_selection_interview"]] },
                                    "$application_preferences.applications.application_number",
                                    "$$REMOVE"
                                ]
                            }
                        },
                        verified_apps: {
                            $addToSet: {
                                $cond: [
                                    { $eq: [{ $toLower: "$application_preferences.applications.status" }, "verified"] },
                                    "$application_preferences.applications.application_number",
                                    "$$REMOVE"
                                ]
                            }
                        },
                        admitted_apps: {
                            $addToSet: {
                                $cond: [
                                    { $in: [{ $toLower: "$application_preferences.applications.status" }, ADMITTED_STATUSES] },
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
                                    { $ne: [{ $toLower: "$application_preferences.applications.status" }, "draft"] },
                                    "$application_preferences.applications.application_number",
                                    "$$REMOVE"
                                ]
                            }
                        },
                        draft_apps: {
                            $addToSet: {
                                $cond: [
                                    { $eq: [{ $toLower: "$application_preferences.applications.status" }, "draft"] },
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

            // Live Count logic: After 6 PM IST, check for expiry > today. Before 6 PM, check for expiry >= today.
            const now = new Date();
            const istHour = parseInt(new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Kolkata',
                hour: 'numeric',
                hour12: false
            }).format(now));

            const liveSmsValidPromise = admission2026Db.collection("candidate_fees_master").find({
                payment_expiry_date: istHour >= 18 ? { $gt: startOfToday } : { $gte: startOfToday }
            }, { projection: { application_number: 1, program_code: 1, stream: 1, shift: 1 } }).toArray();

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
                candidateStats,
                appliedStats,
                admissionFees,
                swipePayments,
                smsSentStats,
                liveSmsValidApps
            ] = await Promise.all([
                candidateStatsPromise,
                appliedStatsPromise,
                admissionFeesPromise,
                swipePaymentsPromise,
                smsSentStatsPromise,
                liveSmsValidPromise
            ]);

            const paidAppNumbers = new Set([
                ...admissionFees.map(val => Number(val)),
                ...swipePayments.map(val => Number(val))
            ].filter(val => val && !isNaN(val)));

            // 3b. Lookup metadata (program, stream, shift) from candidate_fees_master for these paid applications
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

            // 1. Fetch all unique program combinations present in applications
            const applicationPrograms = await CandidateAdmission.aggregate([
                { $match: { academic_year } },
                { $unwind: "$application_preferences.applications" },
                {
                    $group: {
                        _id: {
                            program_code: "$application_preferences.applications.program_code",
                            stream: "$application_preferences.applications.stream",
                            shift: { $ifNull: ["$application_preferences.applications.shift", "Shift-1"] }
                        }
                    }
                }
            ]);

            // 2. Fetch all programs from master list
            const masterPrograms = await programsModel.find({}).lean();

            // 3. Combine results into a unified map
            const programMap: Record<string, any> = {};

            // Initialize with all combinations found in applications
            applicationPrograms.forEach(ap => {
                const { program_code, stream, shift } = ap._id;
                const key = `${program_code}_${stream}_${shift}`;
                programMap[key] = {
                    program_name: program_code, // Default to code
                    program_code: program_code,
                    stream: stream,
                    shift: shift,
                    department: "Unknown",
                    sanctioned_strength: 0,
                    applied_set: new Set(),
                    draft_set: new Set(),
                    total_set: new Set(),
                    hod_selection_set: new Set(),
                    verified_set: new Set(),
                    interview_sms_count: 0,
                    sms_sent_count: 0,
                    hostel_sms_count: 0,
                    other_sms_count: 0,
                    live_valid_sms_set: new Set(),
                    admitted_set: new Set()
                };
            });

            // Overlay/Initialize with Master Programs (even if they have no applications)
            masterPrograms.forEach((p: any) => {
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
                        total_set: new Set(),
                        hod_selection_set: new Set(),
                        verified_set: new Set(),
                        interview_sms_count: 0,
                        sms_sent_count: 0,
                        hostel_sms_count: 0,
                        other_sms_count: 0,
                        live_valid_sms_set: new Set(),
                        admitted_set: new Set()
                    };
                } else {
                    // Update metadata for existing app-found programs
                    programMap[key].program_name = p.program_name;
                    programMap[key].department = p.department_name;
                    programMap[key].sanctioned_strength = p.sanctioned_strength || 0;
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

            // Add Paid stats from the fees master lookup (source of truth for admitted count)
            Object.entries(paidStatsMap).forEach(([key, appNumbers]) => {
                if (programMap[key]) {
                    appNumbers.forEach(app => programMap[key].admitted_set.add(app));
                }
            });

            // Add live SMS valid apps
            liveSmsValidApps.forEach((app: any) => {
                const shift = app.shift || "Shift-1";
                const key = `${app.program_code}_${app.stream}_${shift}`;
                if (programMap[key]) {
                    programMap[key].live_valid_sms_set.add(app.application_number);
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
                        stat.applied_apps.forEach((app: any) => {
                            programMap[key].applied_set.add(app);
                            programMap[key].total_set.add(app);
                        });
                    }
                    if (stat.draft_apps) {
                        stat.draft_apps.forEach((app: any) => {
                            programMap[key].draft_set.add(app);
                            programMap[key].total_set.add(app);
                        });
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
                    applied: p.total_set.size - p.draft_set.size,
                    draft: p.draft_set.size,
                    total_applied: p.total_set.size,
                    hod_selection: p.hod_selection_set.size,
                    verified: p.verified_set.size,
                    interview_sms: p.interview_sms_count,
                    sms_sent: p.sms_sent_count,
                    live_valid_sms_count: Array.from(p.live_valid_sms_set).filter(app => !p.admitted_set.has(app)).length,
                    hostel_sms: p.hostel_sms_count,
                    others_sms: p.other_sms_count,
                    admitted: admittedCount,
                    seats_left: sanctioned - admittedCount
                };
            }).sort((a: any, b: any) =>
                (a.program_name || "").localeCompare(b.program_name || "") ||
                (a.shift || "Shift-1").localeCompare(b.shift || "Shift-1")
            );

            // Calculate Global Totals in Backend
            const globalTotals = result.reduce((acc, cur) => {
                const isUG = cur.program_code?.startsWith('UG-');
                const isPG = cur.program_code?.startsWith('PG-');
                return {
                    total_applied: acc.total_applied + cur.total_applied,
                    ug_total_applied: acc.ug_total_applied + (isUG ? cur.total_applied : 0),
                    pg_total_applied: acc.pg_total_applied + (isPG ? cur.total_applied : 0),
                    applied: acc.applied + cur.applied,
                    draft: acc.draft + cur.draft,
                    hod_selection: acc.hod_selection + cur.hod_selection,
                    verified: acc.verified + cur.verified,
                    interview_sms: acc.interview_sms + cur.interview_sms,
                    ug_interview_sms: acc.ug_interview_sms + (isUG ? cur.interview_sms : 0),
                    pg_interview_sms: acc.pg_interview_sms + (isPG ? cur.interview_sms : 0),
                    sms_sent: acc.sms_sent + cur.sms_sent,
                    ug_sms_sent: acc.ug_sms_sent + (isUG ? cur.sms_sent : 0),
                    pg_sms_sent: acc.pg_sms_sent + (isPG ? cur.sms_sent : 0),
                    admitted: acc.admitted + cur.admitted
                };
            }, {
                total_applied: 0, ug_total_applied: 0, pg_total_applied: 0,
                applied: 0, draft: 0, hod_selection: 0, verified: 0,
                interview_sms: 0, ug_interview_sms: 0, pg_interview_sms: 0,
                sms_sent: 0, ug_sms_sent: 0, pg_sms_sent: 0, admitted: 0
            });

            return res.json({
                success: true,
                data: result,
                globalTotals: globalTotals
            });

        } catch (error) {
            console.error("Overall Admission Statistics Error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal Server Error"
            });
        }
    };


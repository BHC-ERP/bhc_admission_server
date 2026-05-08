import { Request, Response } from "express";
import mongoose from "mongoose";
import CandidateAdmission from "../../models/candidate.model";
import programsModel from "../../models/programs.model";

/**
 * @desc Get comprehensive admission statistics across programs and streams
 * @route GET /api/admin/dashboard/full-statistics
 * @access Admin
 */
export const getFullStatistics = async (req: Request, res: Response) => {
    try {
        const academic_year = "2026-2027";

        /* ============================================================
           1. FETCH PAID CANDIDATES FROM FEE COLLECTION DB
           ============================================================ */
        const feeCollectionDb = mongoose.connection.useDb('fee_collection');
        const auditLogCollection = feeCollectionDb.collection('Admission_fee_payment_audit_Log');

        // Get unique identifiers for successful payments
        // The user suggested checking merchant_param1 against application_number
        const successPayments = await auditLogCollection.find({
            "responsePayload.order_status": "Success",
            "step": "INITIAL_RESPONSE"
        }, { 
            projection: { 
                "responsePayload.merchant_param1": 1,
                "responsePayload.merchant_param4": 1 
            } 
        }).toArray();

        const paidIdentifiers = new Set();
        successPayments.forEach(p => {
            if (p.responsePayload?.merchant_param1) paidIdentifiers.add(p.responsePayload.merchant_param1.toString());
            if (p.responsePayload?.merchant_param4) paidIdentifiers.add(p.responsePayload.merchant_param4.toString());
        });

        /* ============================================================
           2. FETCH ALL PROGRAMS
           ============================================================ */
        const programs = await programsModel.find({ show: true }).lean();

        /* ============================================================
           3. AGGREGATE CANDIDATE DATA PROGRAM-WISE
           ============================================================ */
        const statsAggregation = await CandidateAdmission.aggregate([
            { $match: { academic_year } },
            { $unwind: "$application_preferences.applications" },
            {
                $group: {
                    _id: {
                        program_code: "$application_preferences.applications.program_code",
                        stream: "$application_preferences.applications.stream",
                        shift: "$application_preferences.applications.shift",
                        status: "$application_preferences.applications.status"
                    },
                    count: { $sum: 1 },
                    // Track both to be safe, as per user's mapping request
                    regNumbers: { $push: "$registration_number" },
                    appNumbers: { $push: "$application_preferences.applications.application_number" },
                    markEnteredCount: {
                        $sum: {
                            $cond: [
                                { $gt: [{ $ifNull: ["$academic_background.school_education.twelfth.marks.total", 0] }, 0] },
                                1,
                                0
                            ]
                        }
                    },
                    smsSentCount: { 
                        $sum: { $size: { $ifNull: ["$application_preferences.applications.sms_history", []] } } 
                    }
                }
            }
        ]);

        /* ============================================================
           4. GLOBAL STATS (TOTAL REGISTERED & SMS)
           ============================================================ */
        const totalRegistered = await CandidateAdmission.countDocuments({ academic_year });
        
        const globalSMSCountAgg = await CandidateAdmission.aggregate([
            { $match: { academic_year } },
            { $unwind: "$application_preferences.applications" },
            {
                $group: {
                    _id: null,
                    total: { $sum: { $size: { $ifNull: ["$application_preferences.applications.sms_history", []] } } }
                }
            }
        ]);
        const globalSMSCount = globalSMSCountAgg[0]?.total || 0;

        /* ============================================================
           5. PROCESS AND MAP AGGREGATED DATA
           ============================================================ */
        const statsMap: Record<string, any> = {};

        statsAggregation.forEach(item => {
            const { program_code, stream, shift, status } = item._id;
            if (!program_code) return;

            const key = `${program_code}_${stream}_${shift}`;
            if (!statsMap[key]) {
                statsMap[key] = {
                    registered: 0,
                    markEntered: 0,
                    statuses: {},
                    paidCount: 0,
                    enrolledCount: 0,
                    smsCount: 0
                };
            }

            const target = statsMap[key];
            target.registered += item.count;
            target.markEntered += item.markEnteredCount;
            target.smsCount += item.smsSentCount;
            target.statuses[status] = (target.statuses[status] || 0) + item.count;

            // Check paid count
            item.regNumbers.forEach((reg: any, idx: number) => {
                const appNo = item.appNumbers[idx]?.toString();
                const regNo = reg?.toString();
                if (paidIdentifiers.has(appNo) || paidIdentifiers.has(regNo)) {
                    target.paidCount++;
                }
            });

            // Enrolled check
            if (['ADMITTED', 'ADMIT_FINAL', 'ADMIT'].includes(status)) {
                target.enrolledCount += item.count;
            }
        });

        /* ============================================================
           6. FORMAT FINAL RESPONSE
           ============================================================ */
        const finalResult = programs.map((prog: any) => {
            const pCode = prog.program_code;
            if (!pCode) return null;

            const pStream = prog.stream;
            const pShift = prog.shift;

            const key = `${pCode}_${pStream}_${pShift}`;
            const stats = statsMap[key] || {
                registered: 0, markEntered: 0, statuses: {}, paidCount: 0, enrolledCount: 0, smsCount: 0
            };

            return {
                program_code: pCode,
                program_name: prog.program_name,
                department: prog.department_name,
                type: prog.type,
                stream: pStream,
                shift: pShift,
                sanctioned_strength: prog.sanctioned_strength || 0,
                statistics: {
                    registered: stats.registered,
                    markEntered: stats.markEntered,
                    share: totalRegistered > 0 ? ((stats.registered / totalRegistered) * 100).toFixed(1) + "%" : "0%",
                    hod_selection: (stats.statuses['HOD_SELECTION'] || 0) + (stats.statuses['HOD_SELECTION_INTERVIEW'] || 0),
                    verified: stats.statuses['VERIFIED'] || 0,
                    sms_sent: stats.statuses['SMS_SENT'] || 0,
                    paid: stats.paidCount,
                    not_paid: stats.registered - stats.paidCount,
                    enrolled: stats.enrolledCount,
                    sms_count_program: stats.smsCount
                }
            };
        }).filter(item => item !== null);

        return res.json({
            success: true,
            summary: {
                total_candidates: totalRegistered,
                global_sms_sent_total: globalSMSCount,
                total_payments_verified: paidIdentifiers.size
            },
            data: finalResult
        });

    } catch (error) {
        console.error("Full Statistics Aggregation Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error during statistics generation"
        });
    }
};

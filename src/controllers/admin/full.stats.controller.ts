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
           1. FETCH ALL ACTIVE PROGRAMS
        ============================================================ */
        const programs = await programsModel.find({ show: true }).lean();

        // program_code → program doc  (used to resolve missing shift on applications)
        const programMasterMap: Record<string, any> = {};
        programs.forEach((p: any) => {
            if (p.program_code) programMasterMap[p.program_code] = p;
        });

        /* ============================================================
           2. AGGREGATE CANDIDATE DATA — one doc per application after $unwind
              Groups by program_code + stream + shift + status and collects:
              - unique submitted reg numbers  (true registered count)
              - unique mark-entered reg numbers
              - reg numbers in this bucket    (for paid lookup)
              - app_number → reg_number pairs (bridge for swipe payments)
              - sms count
        ============================================================ */
        const statsAggregation = await CandidateAdmission.aggregate([
            { $match: { academic_year } },
            { $unwind: "$application_preferences.applications" },
            {
                $group: {
                    _id: {
                        program_code: "$application_preferences.applications.program_code",
                        stream: "$application_preferences.applications.stream",
                        shift: {
                            $ifNull: ["$application_preferences.applications.shift", ""]
                        },
                        status: "$application_preferences.applications.status"
                    },
                    applicationCount: { $sum: 1 },

                    // Unique reg numbers that have submitted_at (true registered)
                    submittedRegNumbers: {
                        $addToSet: {
                            $cond: [
                                { $gt: ["$metadata.submitted_at", null] },
                                "$registration_number",
                                "$$REMOVE"
                            ]
                        }
                    },

                    // All unique reg numbers in this bucket (for online paid lookup)
                    regNumbers: { $addToSet: "$registration_number" },

                    // application_number → registration_number bridge
                    // Used to resolve swipe payments (keyed by application_number)
                    // back to a registration_number so both payment sources share
                    // the same paidRegNumbers Set without double-counting
                    appToRegMap: {
                        $push: {
                            appNo: "$application_preferences.applications.application_number",
                            regNo: "$registration_number"
                        }
                    },

                    // Unique reg numbers where 12th marks percentage > 0
                    markEnteredRegNumbers: {
                        $addToSet: {
                            $cond: [
                                {
                                    $gt: [
                                        "$academic_background.school_education.twelfth.marks.percentage",
                                        0
                                    ]
                                },
                                "$registration_number",
                                "$$REMOVE"
                            ]
                        }
                    },

                    // Total SMS messages sent for applications in this bucket
                    smsSentCount: {
                        $sum: {
                            $size: {
                                $ifNull: [
                                    "$application_preferences.applications.sms_history",
                                    []
                                ]
                            }
                        }
                    }
                }
            }
        ]);

        /* ============================================================
           3. BUILD LOOKUP STRUCTURES FOR PAYMENT QUERIES

           allRegNumbers  — all reg numbers across all buckets
                            used to query Admission_fee_payment_audit_Log

           allAppNumbers  — all application numbers across all buckets
                            used to query swipeauditlogs

           appToRegLookup — Map<application_number_string, reg_number_string>
                            bridges swipe payment app numbers to reg numbers
        ============================================================ */
        const allRegNumbers  = new Set<string>();
        const allAppNumbers  = new Set<string>();
        const appToRegLookup = new Map<string, string>();

        statsAggregation.forEach(item => {
            // Collect all reg numbers
            item.regNumbers.forEach((reg: any) => {
                if (reg != null) allRegNumbers.add(reg.toString());
            });

            // Build application_number → registration_number map
            item.appToRegMap.forEach(({ appNo, regNo }: any) => {
                if (appNo != null && regNo != null) {
                    const appStr = appNo.toString();
                    const regStr = regNo.toString();
                    allAppNumbers.add(appStr);
                    // application_preferences.applications.application_number → registration_number
                    appToRegLookup.set(appStr, regStr);
                }
            });
        });

        const feeCollectionDb = mongoose.connection.useDb("fee_collection");

        /* ============================================================
           4A. ONLINE PAYMENTS — Admission_fee_payment_audit_Log
               Match: responsePayload.order_status = "Success"
               Identifier stored in merchant_param1 / merchant_param4
               as registration_number
        ============================================================ */
        const auditLogCollection = feeCollectionDb.collection(
            "Admission_fee_payment_audit_Log"
        );

        const onlinePayments = await auditLogCollection
            .find(
                {
                    "responsePayload.order_status": "Success",
                    $or: [
                        {
                            "responsePayload.merchant_param1": {
                                $in: Array.from(allRegNumbers)
                            }
                        },
                        {
                            "responsePayload.merchant_param4": {
                                $in: Array.from(allRegNumbers)
                            }
                        }
                    ]
                },
                {
                    projection: {
                        "responsePayload.merchant_param1": 1,
                        "responsePayload.merchant_param4": 1
                    }
                }
            )
            .toArray();

        // Single unified Set — both online and swipe payments feed into this
        const paidRegNumbers = new Set<string>();

        onlinePayments.forEach(p => {
            const p1 = p.responsePayload?.merchant_param1?.toString();
            const p4 = p.responsePayload?.merchant_param4?.toString();
            // Guard: only add if this reg number is actually in our candidate set
            if (p1 && allRegNumbers.has(p1)) paidRegNumbers.add(p1);
            if (p4 && allRegNumbers.has(p4)) paidRegNumbers.add(p4);
        });

        /* ============================================================
           4B. SWIPE PAYMENTS — swipeauditlogs
               Match: event = "SWIPE_PAYMENT_RECORDED"
               Identifier: application_number (Number in DB)
               which maps to application_preferences.applications.application_number
               in the candidate doc.

               Resolution chain:
               swipeauditlogs.application_number (e.g. 26008963)
                 → appToRegLookup
                 → application_preferences.applications.application_number = 26008963
                 → registration_number = 202602629
                 → paidRegNumbers.add("202602629")
        ============================================================ */
        const swipeCollection = feeCollectionDb.collection("swipeauditlogs");

        // application_number is stored as Number in swipeauditlogs
        const appNumbersAsNumbers = Array.from(allAppNumbers)
            .map(n => {
                const asNum = Number(n);
                return isNaN(asNum) ? n : asNum;
            });

        const swipePayments = await swipeCollection
            .find(
                {
                    event: "SWIPE_PAYMENT_RECORDED",
                    application_number: { $in: appNumbersAsNumbers }
                },
                {
                    projection: { application_number: 1 }
                }
            )
            .toArray();

        swipePayments.forEach(s => {
            if (s.application_number != null) {
                const appStr = s.application_number.toString();
                // Resolve application_number → registration_number
                const regStr = appToRegLookup.get(appStr);
                if (regStr) paidRegNumbers.add(regStr);
            }
        });

        /* ============================================================
           5. GLOBAL TOTALS
        ============================================================ */
        const totalRegistered = await CandidateAdmission.countDocuments({
            academic_year
        });

        const globalSMSAgg = await CandidateAdmission.aggregate([
            { $match: { academic_year } },
            { $unwind: "$application_preferences.applications" },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: {
                            $size: {
                                $ifNull: [
                                    "$application_preferences.applications.sms_history",
                                    []
                                ]
                            }
                        }
                    }
                }
            }
        ]);
        const globalSMSCount: number = globalSMSAgg[0]?.total || 0;

        /* ============================================================
           6. BUILD STATS MAP  →  key: "program_code_stream_shift"

           For each aggregation bucket:
           a) Resolve shift from program master if missing on the application
           b) Accumulate unique submitted candidates via Set (no double-count)
           c) Mark paid candidates by checking unified paidRegNumbers Set
           d) Count enrolled from ADMITTED / ADMIT_FINAL / ADMIT statuses
        ============================================================ */
        const ADMITTED_STATUSES = new Set(["ADMITTED", "ADMIT_FINAL", "ADMIT"]);

        const statsMap: Record<
            string,
            {
                submittedRegSet:   Set<string>;
                markEnteredRegSet: Set<string>;
                paidRegSet:        Set<string>;
                enrolledCount:     number;
                smsCount:          number;
                statuses:          Record<string, number>;
                applicationCount:  number;
            }
        > = {};

        statsAggregation.forEach(item => {
            const { program_code, stream, status } = item._id;
            if (!program_code) return;

            // Resolve shift: use what's on the application, fall back to program master
            let shift = item._id.shift;
            if (!shift && programMasterMap[program_code]) {
                shift = programMasterMap[program_code].shift || "";
            }

            const key = `${program_code}_${stream}_${shift}`;

            if (!statsMap[key]) {
                statsMap[key] = {
                    submittedRegSet:   new Set(),
                    markEnteredRegSet: new Set(),
                    paidRegSet:        new Set(),
                    enrolledCount:     0,
                    smsCount:          0,
                    statuses:          {},
                    applicationCount:  0
                };
            }

            const target = statsMap[key];

            // Unique submitted candidates
            item.submittedRegNumbers.forEach((reg: any) => {
                if (reg != null) target.submittedRegSet.add(reg.toString());
            });

            // Unique mark-entered candidates
            item.markEnteredRegNumbers.forEach((reg: any) => {
                if (reg != null) target.markEnteredRegSet.add(reg.toString());
            });

            // Paid candidates — unified check (online + swipe)
            item.regNumbers.forEach((reg: any) => {
                if (reg != null && paidRegNumbers.has(reg.toString())) {
                    target.paidRegSet.add(reg.toString());
                }
            });

            // Status bucket count
            target.statuses[status] =
                (target.statuses[status] || 0) + item.applicationCount;
            target.applicationCount += item.applicationCount;

            // Enrolled
            if (ADMITTED_STATUSES.has(status)) {
                target.enrolledCount += item.applicationCount;
            }

            // SMS
            target.smsCount += item.smsSentCount;
        });

        /* ============================================================
           7. FORMAT FINAL RESPONSE — one entry per program
        ============================================================ */
        const finalResult = programs
            .map((prog: any) => {
                const { program_code: pCode, stream: pStream, shift: pShift } = prog;
                if (!pCode) return null;

                const key = `${pCode}_${pStream}_${pShift}`;
                const s   = statsMap[key];

                const registeredCount  = s ? s.submittedRegSet.size   : 0;
                const markEnteredCount = s ? s.markEnteredRegSet.size  : 0;
                const paidCount        = s ? s.paidRegSet.size         : 0;
                const enrolledCount    = s ? s.enrolledCount           : 0;
                const smsCount         = s ? s.smsCount                : 0;
                const statuses         = s ? s.statuses                : {};
                const applicationCount = s ? s.applicationCount        : 0;

                return {
                    program_code:        pCode,
                    program_name:        prog.program_name,
                    department:          prog.department_name,
                    type:                prog.type,
                    stream:              pStream,
                    shift:               pShift,
                    sanctioned_strength: prog.sanctioned_strength || 0,
                    statistics: {
                        total_applications: applicationCount,
                        registered:         registeredCount,
                        mark_entered:       markEnteredCount,
                        share:
                            totalRegistered > 0
                                ? ((registeredCount / totalRegistered) * 100).toFixed(1) + "%"
                                : "0%",
                        applied:       statuses["Applied"]       || 0,
                        hod_selection:
                            (statuses["HOD_SELECTION"] || 0) +
                            (statuses["HOD_SELECTION_INTERVIEW"] || 0),
                        verified:      statuses["VERIFIED"]      || 0,
                        sms_sent:      statuses["SMS_SENT"]      || 0,
                        paid:          paidCount,
                        // not_paid = admitted but haven't paid yet
                        not_paid:      Math.max(0, enrolledCount - paidCount),
                        enrolled:      enrolledCount,
                        sms_count:     smsCount,
                        seats_available: Math.max(
                            0,
                            (prog.sanctioned_strength || 0) - enrolledCount
                        )
                    }
                };
            })
            .filter(Boolean);

        /* ============================================================
           8. RESPONSE
        ============================================================ */
        return res.json({
            success: true,
            summary: {
                total_candidates:         totalRegistered,
                global_sms_sent:          globalSMSCount,
                total_admission_fee_paid: paidRegNumbers.size
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
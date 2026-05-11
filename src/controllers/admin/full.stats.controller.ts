import { Request, Response } from "express";
import mongoose from "mongoose";
import CandidateAdmission from "../../models/candidate.model";
import programsModel from "../../models/programs.model";

export const getFullStatistics = async (req: Request, res: Response) => {
    try {
        const academic_year = "2026-2027";
        const ADMITTED_STATUSES = new Set(["ADMITTED", "ADMIT_FINAL", "ADMIT"]);

        /* ============================================================
           1. PROGRAMS
        ============================================================ */
        const programs = await programsModel.find({ show: true }).lean();
        const programMasterMap: Record<string, any> = {};
        programs.forEach((p: any) => {
            if (p.program_code) programMasterMap[p.program_code] = p;
        });

        /* ============================================================
           2. AGGREGATE CANDIDATE DATA
        ============================================================ */
        const statsAggregation = await CandidateAdmission.aggregate([
            { $match: { academic_year } },
            { $unwind: "$application_preferences.applications" },
            {
                $group: {
                    _id: {
                        program_code: "$application_preferences.applications.program_code",
                        stream: "$application_preferences.applications.stream",
                        shift: { $ifNull: ["$application_preferences.applications.shift", ""] },
                        status: "$application_preferences.applications.status"
                    },
                    applicationCount: { $sum: 1 },
                    submittedRegNumbers: {
                        $addToSet: {
                            $cond: [
                                { $gt: ["$metadata.submitted_at", null] },
                                "$registration_number",
                                "$$REMOVE"
                            ]
                        }
                    },
                    regNumbers: { $addToSet: "$registration_number" },
                    appToRegMap: {
                        $push: {
                            appNo: "$application_preferences.applications.application_number",
                            regNo: "$registration_number",
                            program_code: "$application_preferences.applications.program_code",
                            stream: "$application_preferences.applications.stream"
                        }
                    },
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
           3. DEBUG: Get all application numbers from admitted candidates
        ============================================================ */
        const allAdmittedApplications: any[] = [];

        statsAggregation.forEach(item => {
            if (ADMITTED_STATUSES.has(item._id.status)) {
                item.appToRegMap.forEach(({ appNo, regNo, program_code, stream }: any) => {
                    if (appNo != null) {
                        allAdmittedApplications.push({
                            application_number: appNo,
                            registration_number: regNo,
                            program_code,
                            stream,
                            status: item._id.status
                        });
                    }
                });
            }
        });

        console.log("Total admitted applications:", allAdmittedApplications.length);
        console.log("Sample admitted applications (first 5):", allAdmittedApplications.slice(0, 5));

        const feeCollectionDb = mongoose.connection.useDb("fee_collection");

        /* ============================================================
           4A. DEBUG: Check what's in admission_fees collection
        ============================================================ */
        const admissionFeesCollection = feeCollectionDb.collection("admission_fees");

        // Get sample payments to see the data structure
        const samplePayments = await admissionFeesCollection.find({ status: "SUCCESS" }).limit(5).toArray();
        console.log("Sample online payments:", samplePayments.map(p => ({
            application_number: p.application_number,
            registration_number: p.registration_number,
            status: p.status,
            amount: p.amount
        })));

        // Get all successful payment application numbers
        const allOnlinePayments = await admissionFeesCollection
            .find({ status: "SUCCESS" }, { projection: { application_number: 1, registration_number: 1, amount: 1 } })
            .toArray();

        console.log("Total online payments:", allOnlinePayments.length);
        console.log("Online payment application numbers:", allOnlinePayments.slice(0, 10).map(p => p.application_number));

        // Check for matches
        const admittedAppNumbers = new Set(allAdmittedApplications.map(a => a.application_number.toString()));
        const onlinePaymentAppNumbers = new Set(allOnlinePayments.map(p => p.application_number?.toString()).filter(Boolean));

        const matchingAppNumbers = [...admittedAppNumbers].filter(appNo => onlinePaymentAppNumbers.has(appNo));
        console.log("Matching application numbers between admitted and online payments:", matchingAppNumbers.length);
        console.log("First 10 matching app numbers:", matchingAppNumbers.slice(0, 10));

        /* ============================================================
           4B. SWIPE PAYMENTS DEBUG
        ============================================================ */
        const swipeCollection = feeCollectionDb.collection("swipepayments");

        const sampleSwipePayments = await swipeCollection.find({ status: "SWIPE_RECORDED" }).limit(5).toArray();
        console.log("Sample swipe payments:", sampleSwipePayments.map(s => ({
            application_number: s.application_number,
            registration_number: s.registration_number,
            status: s.status,
            total_amount: s.total_amount
        })));

        const allSwipePayments = await swipeCollection
            .find({ status: "SWIPE_RECORDED" }, { projection: { application_number: 1, registration_number: 1, total_amount: 1 } })
            .toArray();

        console.log("Total swipe payments:", allSwipePayments.length);

        const swipePaymentAppNumbers = new Set(allSwipePayments.map(s => s.application_number?.toString()).filter(Boolean));
        const matchingSwipeAppNumbers = [...admittedAppNumbers].filter(appNo => swipePaymentAppNumbers.has(appNo));
        console.log("Matching application numbers between admitted and swipe payments:", matchingSwipeAppNumbers.length);

        /* ============================================================
           5. FIXED PAYMENT LOOKUP - Using multiple matching strategies
        ============================================================ */

        // Create a map of application_number to program details from admitted candidates
        const appToProgramMap = new Map();
        allAdmittedApplications.forEach(app => {
            appToProgramMap.set(app.application_number.toString(), {
                program_code: app.program_code,
                stream: app.stream,
                registration_number: app.registration_number
            });
        });

        // Process online payments with matching
        const onlinePaymentsByProgram: Record<string, any> = {};

        for (const payment of allOnlinePayments) {
            const appNo = payment.application_number?.toString();
            if (!appNo) continue;

            const programInfo = appToProgramMap.get(appNo);
            if (!programInfo) {
                console.log(`No matching program found for online payment application: ${appNo}`);
                continue;
            }

            const key = `${programInfo.program_code}_${programInfo.stream}_Shift-1`;

            if (!onlinePaymentsByProgram[key]) {
                onlinePaymentsByProgram[key] = {
                    _id: {
                        program_code: programInfo.program_code,
                        stream: programInfo.stream,
                        shift: "Shift-1"
                    },
                    count: 0,
                    application_numbers: new Set(),
                    registration_numbers: new Set(),
                    payment_details: [],
                    total_amount: 0
                };
            }

            onlinePaymentsByProgram[key].count++;
            onlinePaymentsByProgram[key].application_numbers.add(appNo);
            onlinePaymentsByProgram[key].registration_numbers.add(programInfo.registration_number);
            onlinePaymentsByProgram[key].payment_details.push({
                application_number: payment.application_number,
                registration_number: programInfo.registration_number,
                amount: payment.amount,
                transaction_date: payment.transaction_date,
                tracking_id: payment.tracking_id
            });
            onlinePaymentsByProgram[key].total_amount += parseFloat(payment.amount || 0);
        }

        // Process swipe payments with matching
        const swipePaymentsByProgram: Record<string, any> = {};

        for (const payment of allSwipePayments) {
            const appNo = payment.application_number?.toString();
            if (!appNo) continue;

            const programInfo = appToProgramMap.get(appNo);
            if (!programInfo) {
                console.log(`No matching program found for swipe payment application: ${appNo}`);
                continue;
            }

            const key = `${programInfo.program_code}_${programInfo.stream}_Shift-1`;

            if (!swipePaymentsByProgram[key]) {
                swipePaymentsByProgram[key] = {
                    _id: {
                        program_code: programInfo.program_code,
                        stream: programInfo.stream,
                        shift: "Shift-1"
                    },
                    count: 0,
                    application_numbers: new Set(),
                    registration_numbers: new Set(),
                    payment_details: [],
                    total_amount: 0
                };
            }

            swipePaymentsByProgram[key].count++;
            swipePaymentsByProgram[key].application_numbers.add(appNo);
            swipePaymentsByProgram[key].registration_numbers.add(programInfo.registration_number);
            swipePaymentsByProgram[key].payment_details.push({
                application_number: payment.application_number,
                registration_number: programInfo.registration_number,
                swipe_no: payment.swipe_no,
                total_amount: payment.total_amount,
                transaction_date: payment.transaction_date,
                tracking_id: payment.tracking_id
            });
            swipePaymentsByProgram[key].total_amount += parseFloat(payment.total_amount || 0);
        }

        console.log("Online payments by program:", Object.keys(onlinePaymentsByProgram).length);
        console.log("Swipe payments by program:", Object.keys(swipePaymentsByProgram).length);

        // Convert Sets to Arrays for JSON response
        const onlinePaymentsArray = Object.values(onlinePaymentsByProgram).map(item => ({
            ...item,
            application_numbers: Array.from(item.application_numbers),
            registration_numbers: Array.from(item.registration_numbers)
        }));

        const swipePaymentsArray = Object.values(swipePaymentsByProgram).map(item => ({
            ...item,
            application_numbers: Array.from(item.application_numbers),
            registration_numbers: Array.from(item.registration_numbers)
        }));

        /* ============================================================
           6. SMS COUNT — candidate_fees_master
        ============================================================ */
        const admission2026Db = mongoose.connection.useDb("admission2026");
        const candidateFeesMasterCollection = admission2026Db.collection("candidate_fees_master");

        const feesMasterSMSAgg = await candidateFeesMasterCollection.aggregate([
            {
                $match: {
                    academic_year,
                    is_payment_enabled: true
                }
            },
            {
                $group: {
                    _id: {
                        program_code: "$program_code",
                        stream: "$stream",
                        shift: { $ifNull: ["$shift", ""] }
                    },
                    smsCount: { $sum: 1 }
                }
            }
        ]).toArray();

        const feesMasterSMSMap: Record<string, number> = {};
        let globalFeesMasterSMSCount = 0;

        feesMasterSMSAgg.forEach((item: any) => {
            const { program_code, stream, shift } = item._id;
            if (!program_code) return;
            const key = `${program_code}_${stream}_${shift}`;
            feesMasterSMSMap[key] = item.smsCount;
            globalFeesMasterSMSCount += item.smsCount;
        });

        /* ============================================================
           7. GLOBAL TOTALS
        ============================================================ */
        const totalRegistered = await CandidateAdmission.aggregate([
            {
                $project: {
                    registration_number: 1,
                    totalApplications: {
                        $size: "$application_preferences.applications"
                    }
                }
            }
        ]);


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
           8. BUILD STATS MAP
        ============================================================ */
        const statsMap: Record<
            string,
            {
                submittedRegSet: Set<string>;
                markEnteredRegSet: Set<string>;
                enrolledCount: number;
                smsCount: number;
                statuses: Record<string, number>;
                totalAppCount: number;
            }
        > = {};

        statsAggregation.forEach(item => {
            const { program_code, stream, status } = item._id;
            if (!program_code) return;

            let shift = item._id.shift;
            if (!shift && programMasterMap[program_code]) {
                shift = programMasterMap[program_code].shift || "";
            }

            const key = `${program_code}_${stream}_${shift}`;

            if (!statsMap[key]) {
                statsMap[key] = {
                    submittedRegSet: new Set(),
                    markEnteredRegSet: new Set(),
                    enrolledCount: 0,
                    smsCount: 0,
                    statuses: {},
                    totalAppCount: 0
                };
            }

            const target = statsMap[key];

            item.submittedRegNumbers.forEach((reg: any) => {
                if (reg != null) target.submittedRegSet.add(reg.toString());
            });

            item.markEnteredRegNumbers.forEach((reg: any) => {
                if (reg != null) target.markEnteredRegSet.add(reg.toString());
            });

            target.statuses[status] = (target.statuses[status] || 0) + item.applicationCount;
            target.totalAppCount += item.applicationCount;

            if (ADMITTED_STATUSES.has(status)) {
                target.enrolledCount += item.applicationCount;
            }

            target.smsCount += item.smsSentCount;
        });

        /* ============================================================
           9. BUILD FINAL PROGRAM DATA WITH PAYMENTS
        ============================================================ */
        const programMap: Record<string, any> = {};

        // Initialize with all programs
        programs.forEach((prog: any) => {
            const { program_code: pCode, stream: pStream, shift: pShift } = prog;
            if (!pCode) return;

            const key = `${pCode}_${pStream}_${pShift}`;
            programMap[key] = {
                program_info: {
                    program_code: pCode,
                    program_name: prog.program_name,
                    department: prog.department_name,
                    type: prog.type,
                    stream: pStream,
                    shift: pShift,
                    sanctioned_strength: prog.sanctioned_strength || 0
                },
                statistics: {
                    total_applications: 0,
                    registered: 0,
                    mark_entered: 0,
                    enrolled: 0,
                    sms_sent: 0,
                    sms_history_count: 0,
                    seats_available: 0,
                    status_breakdown: {}
                },
                payments: {
                    online: {
                        count: 0,
                        unique_students: 0,
                        total_amount: 0,
                        transactions: []
                    },
                    swipe: {
                        count: 0,
                        unique_students: 0,
                        total_amount: 0,
                        transactions: []
                    },
                    combined: {
                        total_paid_students: 0,
                        total_amount: 0
                    }
                }
            };
        });

        // Add statistics to program map
        Object.entries(statsMap).forEach(([key, stats]) => {
            if (programMap[key]) {
                const sanctionedStrength = programMap[key].program_info.sanctioned_strength;
                const registeredCount = stats.submittedRegSet.size;
                const enrolledCount = stats.enrolledCount;

                programMap[key].statistics = {
                    total_applications: stats.totalAppCount,
                    registered: registeredCount,
                    mark_entered: stats.markEnteredRegSet.size,
                    enrolled: enrolledCount,
                    sms_sent: feesMasterSMSMap[key] || 0,
                    sms_history_count: stats.smsCount,
                    seats_available: Math.max(0, sanctionedStrength - enrolledCount),
                    status_breakdown: stats.statuses
                };
            }
        });

        // Add online payments to program map
        onlinePaymentsArray.forEach(payment => {
            const { program_code, stream, shift } = payment._id;
            const key = `${program_code}_${stream}_${shift}`;

            if (programMap[key]) {
                programMap[key].payments.online = {
                    count: payment.count,
                    unique_students: payment.registration_numbers.length,
                    total_amount: payment.total_amount,
                    transactions: payment.payment_details
                };
            }
        });

        // Add swipe payments to program map
        swipePaymentsArray.forEach(payment => {
            const { program_code, stream, shift } = payment._id;
            const key = `${program_code}_${stream}_${shift}`;

            if (programMap[key]) {
                programMap[key].payments.swipe = {
                    count: payment.count,
                    unique_students: payment.registration_numbers.length,
                    total_amount: payment.total_amount,
                    transactions: payment.payment_details
                };

                // Update combined totals
                const onlineTotal = programMap[key].payments.online.total_amount || 0;
                programMap[key].payments.combined = {
                    total_paid_students: programMap[key].payments.online.unique_students + payment.registration_numbers.length,
                    total_amount: onlineTotal + payment.total_amount
                };
            }
        });

        // Calculate combined totals for programs without swipe payments
        Object.keys(programMap).forEach(key => {
            if (programMap[key].payments.combined.total_amount === 0 && programMap[key].payments.online.total_amount > 0) {
                programMap[key].payments.combined = {
                    total_paid_students: programMap[key].payments.online.unique_students,
                    total_amount: programMap[key].payments.online.total_amount
                };
            }
        });

        // Convert program map to array for response
        const programsData = Object.values(programMap);

        /* ============================================================
           10. RESPONSE WITH DEBUG INFO
        ============================================================ */
        return res.json({
            success: true,

            summary: {
                total_candidates: totalRegistered,
                global_sms_sent: globalFeesMasterSMSCount,
                global_sms_history_count: globalSMSCount,
                total_payment_records: {
                    online: allOnlinePayments.length,
                    swipe: allSwipePayments.length,
                    total: allOnlinePayments.length + allSwipePayments.length
                }
            },
            data: {
                programs: programsData
            }
        });

    } catch (error) {
        console.error("Full Statistics Aggregation Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error during statistics generation"
        });
    }
};
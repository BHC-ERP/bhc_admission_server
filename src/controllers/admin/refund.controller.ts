import { Request, Response } from 'express';
import mongoose from 'mongoose';
import CandidateAdmission from '../../models/candidate.model';

interface UnifiedPayment {
    id: string;
    payment_type: 'application_fee' | 'admission_fee';
    source: string;
    order_id: string;
    tracking_id: string;
    bank_ref_no: string;
    amount: number;
    fullName: string;
    phone: string;
    email: string;
    application_number: string;
    registration_number: string;
    transaction_date: string;
    status: string;
    refund_status?: 'not_refunded' | 'refund_initiated' | 'refunded';
    refund_details?: any;
    fees_breakup?: {
        aided_fees?: any[];
        aided_management_fees?: any[];
        management_fees?: any[];
    };
    selected_courses?: string[];
    duplicate_courses?: string[];
    course_name?: string;
    stream?: string;
    programme_type?: string;
    raw: any;
}

const normalizePhone = (p: string) => {
    if (!p) return "";
    const cleaned = String(p).replace(/\D/g, "");
    return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
};

const normalizeEmail = (e: string) => String(e || "").toLowerCase().trim();

const resolveProgramDetails = (
    payment: any,
    candidateMapByReg: Map<string, any>,
    candidateMapByApp: Map<string, any>,
    candidateMapByPhone: Map<string, any>,
    candidateMapByEmail: Map<string, any>
) => {
    const regNo = payment.registration_number ? String(payment.registration_number).trim() : "";
    const appNo = payment.application_number ? String(payment.application_number).trim() : "";
    const phone = normalizePhone(payment.phone);
    const email = normalizeEmail(payment.email);

    let cand: any = null;
    if (regNo) cand = candidateMapByReg.get(regNo);
    if (!cand && appNo) cand = candidateMapByApp.get(appNo);
    if (!cand && phone) cand = candidateMapByPhone.get(phone);
    if (!cand && email) cand = candidateMapByEmail.get(email);

    let course_name = "";
    let stream = "";
    let programme_type = "";

    if (cand) {
        programme_type = cand.appliedProgrammeType || cand.academic_background?.programmeType || "";

        const apps = cand.application_preferences?.applications || [];

        let matchedApps: any[] = [];

        if (payment.payment_type === 'admission_fee') {
            // For admission fees, match by exact application number first (from merchant_param1 / appNo)
            if (appNo) {
                const exactApp = apps.find((a: any) => String(a.application_number).trim() === appNo);
                if (exactApp) matchedApps.push(exactApp);
            }

            // Fallback 1: match by transaction_id
            if (matchedApps.length === 0) {
                const txApp = apps.find((a: any) =>
                    (payment.order_id && a.transaction_id && String(a.transaction_id).trim() === String(payment.order_id).trim()) ||
                    (payment.tracking_id && a.transaction_id && String(a.transaction_id).trim() === String(payment.tracking_id).trim())
                );
                if (txApp) matchedApps.push(txApp);
            }

            // Fallback 2: priority statuses
            if (matchedApps.length === 0) {
                const priorityStatuses = ['ADMITTED', 'ADMIT_FINAL', 'ADMIT', 'ADMISSION', 'ADMISSION_PAYMENT_PENDING', 'SMS_SENT', 'VERIFIED', 'Applied'];
                for (const status of priorityStatuses) {
                    const priorityApp = apps.find((a: any) => a.status === status);
                    if (priorityApp) {
                        matchedApps.push(priorityApp);
                        break;
                    }
                }
            }

            // Fallback 3: first application
            if (matchedApps.length === 0 && apps.length > 0) {
                matchedApps.push(apps[0]);
            }
        } else {
            // Original logic for application fees
            // 1. Try matching multiple apps by transaction_id
            matchedApps = apps.filter((a: any) =>
                (payment.order_id && a.transaction_id && String(a.transaction_id).trim() === String(payment.order_id).trim()) ||
                (payment.tracking_id && a.transaction_id && String(a.transaction_id).trim() === String(payment.tracking_id).trim())
            );

            // 2. Fallback to exact single application_number matching
            if (matchedApps.length === 0 && appNo) {
                const exactApp = apps.find((a: any) => String(a.application_number).trim() === appNo);
                if (exactApp) matchedApps.push(exactApp);
            }

            // 3. Fallback to priority statuses
            if (matchedApps.length === 0) {
                const priorityStatuses = ['ADMITTED', 'ADMIT_FINAL', 'ADMIT', 'ADMISSION', 'ADMISSION_PAYMENT_PENDING', 'SMS_SENT', 'VERIFIED', 'Applied'];
                for (const status of priorityStatuses) {
                    const priorityApp = apps.find((a: any) => a.status === status);
                    if (priorityApp) {
                        matchedApps.push(priorityApp);
                        break;
                    }
                }
            }

            // 4. Default to first application if still empty
            if (matchedApps.length === 0 && apps.length > 0) {
                matchedApps.push(apps[0]);
            }

            // Supplemental check: If amount covers multiple courses but some apps are missing transaction_id (e.g. the first application)
            const currentProgType = cand.appliedProgrammeType || cand.academic_background?.programmeType || "UG";
            const feePerProgram = currentProgType === 'PG' ? 200 : 100;
            const expectedCount = Math.max(1, Math.round(payment.amount / feePerProgram));

            if (matchedApps.length < expectedCount && apps.length > matchedApps.length) {
                // Find remaining apps not already matched
                const remainingApps = apps.filter((a: any) =>
                    !matchedApps.some((ma: any) => String(ma.application_number).trim() === String(a.application_number).trim())
                );

                // Prioritize those with empty or missing transaction_id
                const emptyTxApps = remainingApps.filter((a: any) => !a.transaction_id || String(a.transaction_id).trim() === "");
                for (const app of emptyTxApps) {
                    if (matchedApps.length >= expectedCount) break;
                    matchedApps.push(app);
                }

                // Fallback to other remaining apps if we still need more
                if (matchedApps.length < expectedCount) {
                    const otherApps = remainingApps.filter((a: any) => a.transaction_id && String(a.transaction_id).trim() !== "");
                    for (const app of otherApps) {
                        if (matchedApps.length >= expectedCount) break;
                        matchedApps.push(app);
                    }
                }
            }
        }

        if (matchedApps.length > 0) {
            // Sort matchedApps according to their original order in cand.application_preferences.applications list
            matchedApps.sort((a: any, b: any) => {
                const idxA = apps.findIndex((x: any) => String(x.application_number) === String(a.application_number));
                const idxB = apps.findIndex((x: any) => String(x.application_number) === String(b.application_number));
                return idxA - idxB;
            });

            course_name = matchedApps.map((a: any) => a.program_name).filter(Boolean).join(' & ');

            const streams = Array.from(new Set(matchedApps.map((a: any) => a.stream).filter(Boolean)));
            stream = streams.join(' & ');

            const progTypes = Array.from(new Set(matchedApps.map((a: any) => a.application_type).filter(Boolean)));
            if (progTypes.length > 0) {
                programme_type = progTypes.join(' & ');
            }

            payment.application_number = matchedApps.map((a: any) => a.application_number).filter(Boolean).join(', ');
        }
    }

    if (!stream) {
        const src = String(payment.source).toLowerCase();
        if (src.includes("aided")) {
            stream = "Aided";
        } else if (src.includes("self-finance") || src.includes("self_finance") || src.includes("self-charge") || src.includes("self-financing")) {
            stream = "Self-Finance";
        }
    }

    if (!course_name) {
        course_name = payment.payment_type === 'application_fee' ? "Application Fee" : "Admission Fee";
    }

    if (!programme_type && cand) {
        programme_type = cand.appliedProgrammeType || cand.academic_background?.programmeType || "UG";
    }

    return { course_name, stream, programme_type };
};

const checkIsAdmitted = (cand: any): boolean => {
    if (!cand) return false;
    const currentStatus = cand.admission_status?.current || "";
    const admittedStatuses = ['ADMITTED', 'ADMIT_FINAL', 'ADMIT', 'ADMISSION'];
    if (admittedStatuses.includes(currentStatus)) {
        return true;
    }
    const apps = cand.application_preferences?.applications || [];
    return apps.some((app: any) =>
        admittedStatuses.includes(app.status) ||
        app.admission_details?.admit_status === 'Yes'
    );
};

/**
 * Controller to fetch all duplicate payments for application fees and admission fees.
 */
export const getDuplicatePayments = async (req: Request, res: Response): Promise<any> => {
    try {
        console.log("[Refund API] Scanning for duplicate payments...");

        // 1. Fetch Candidate lookups to map phone/email for collections that don't store them directly
        const candidates = await CandidateAdmission.find({}).lean();
        const candidateMapByReg = new Map<string, any>();
        const candidateMapByApp = new Map<string, any>();
        const candidateMapByPhone = new Map<string, any>();
        const candidateMapByEmail = new Map<string, any>();

        candidates.forEach((c: any) => {
            if (c.registration_number) {
                candidateMapByReg.set(String(c.registration_number).trim(), c);
            }
            if (c.personal_details?.phone) {
                candidateMapByPhone.set(normalizePhone(c.personal_details.phone), c);
            }
            if (c.personal_details?.email) {
                candidateMapByEmail.set(normalizeEmail(c.personal_details.email), c);
            }
            if (c.application_preferences?.applications) {
                c.application_preferences.applications.forEach((app: any) => {
                    if (app.application_number) {
                        candidateMapByApp.set(String(app.application_number).trim(), c);
                    }
                });
            }
        });

        // 2. Fetch all initiated/completed refunds from fee_collection.refund_initiate to mark refund status
        const refundInitiateCol = mongoose.connection.useDb('fee_collection').collection('refund_initiate');
        const refundRecords = await refundInitiateCol.find({}).toArray();
        const refundMap = new Map<string, any>();
        refundRecords.forEach((r: any) => {
            const orderId = r.order_id ? String(r.order_id).trim() : "";
            const trackId = r.tracking_id ? String(r.tracking_id).trim() : "";

            if (orderId && orderId !== "undefined" && orderId !== "null" && orderId !== "") {
                refundMap.set(orderId, r);
            }
            if (trackId && trackId !== "undefined" && trackId !== "null" && trackId !== "") {
                refundMap.set(trackId, r);
            }
        });

        const rawApplicationPayments: UnifiedPayment[] = [];
        const rawAdmissionPayments: UnifiedPayment[] = [];

        // --- CCAVENUE ADMISSIONS: ccavenue_payment.ccavenue_admissions ---
        // merchant_param2 empty → Application fee
        // merchant_param2 has value → Self-Finance admission fee
        try {
            const ccAdmissionsCol = mongoose.connection.useDb('ccavenue_payment').collection('ccavenue_admissions');
            const ccAdmissions = await ccAdmissionsCol.find({
                "data.order_status": "Success"
            }).toArray();

            ccAdmissions.forEach((doc: any) => {
                const data = doc.data || {};
                const isApplicationFee = !data.merchant_param2 || String(data.merchant_param2).trim() === "";

                const payment = {
                    id: String(doc._id),
                    order_id: data.order_id || "",
                    tracking_id: data.tracking_id || "",
                    bank_ref_no: data.bank_ref_no || "",
                    amount: parseFloat(data.amount || '0'),
                    fullName: data.billing_name || "",
                    phone: data.billing_tel || "",
                    email: data.billing_email || "",
                    transaction_date: data.trans_date || doc.createdAt || "",
                    status: data.order_status || "Success",
                    raw: doc
                };

                if (isApplicationFee) {
                    rawApplicationPayments.push({
                        ...payment,
                        payment_type: 'application_fee' as const,
                        source: 'ccavenue_admissions (Application)',
                        application_number: data.merchant_param4 || "",
                        registration_number: data.merchant_param1 || "",
                    });
                } else {
                    rawAdmissionPayments.push({
                        ...payment,
                        payment_type: 'admission_fee' as const,
                        source: 'ccavenue_admissions (Self-Finance)',
                        application_number: data.merchant_param1 || "",
                        registration_number: data.merchant_param4 || "",
                    });
                }
            });
        } catch (e: any) {
            console.warn("Could not query ccavenue_admissions collection:", e.message);
        }

        // --- ADMISSION FEES AIDED: ccavenue_payment.ccavenue_admission_fee ---
        try {
            const ccAidedCol = mongoose.connection.useDb('ccavenue_payment').collection('ccavenue_admission_fee');
            const ccAided = await ccAidedCol.find({ "data.order_status": "Success" }).toArray();

            ccAided.forEach((doc: any) => {
                const data = doc.data || {};

                rawAdmissionPayments.push({
                    id: String(doc._id),
                    payment_type: 'admission_fee',
                    source: 'ccavenue_admission_fee (Aided)',
                    order_id: data.order_id || "",
                    tracking_id: data.tracking_id || "",
                    bank_ref_no: data.bank_ref_no || "",
                    amount: parseFloat(data.amount || '0'),
                    fullName: data.billing_name || "",
                    phone: data.billing_tel || "",
                    email: data.billing_email || "",
                    application_number: data.merchant_param1 || "",
                    registration_number: data.merchant_param4 || "",
                    transaction_date: data.trans_date || doc.createdAt || "",
                    status: data.order_status || "Success",
                    raw: doc
                });
            });
        } catch (e: any) {
            console.warn("Could not query ccavenue_admission_fee (Aided) collection:", e.message);
        }

        // --- ADMISSION FEES BREAKUP: fee_collection.admission_fees ---
        try {
            const feeAdmCol = mongoose.connection.useDb('fee_collection').collection('admission_fees');
            const feeAdms = await feeAdmCol.find({ "status": "SUCCESS" }).toArray();

            feeAdms.forEach((doc: any) => {
                const appNo = doc.application_number ? String(doc.application_number).trim() : "";
                const regNo = doc.registration_number ? String(doc.registration_number).trim() : "";

                // Lookup candidate info
                const cand = candidateMapByReg.get(regNo) || candidateMapByApp.get(appNo);

                rawAdmissionPayments.push({
                    id: String(doc._id),
                    payment_type: 'admission_fee',
                    source: 'fee_collection.admission_fees',
                    order_id: doc.order_id || doc.student_id || "",
                    tracking_id: doc.tracking_id || "",
                    bank_ref_no: doc.bank_ref_no || "",
                    amount: parseFloat(doc.total_amount || doc.amount || '0'),
                    fullName: doc.fullName || cand?.personal_details?.fullName || "",
                    phone: cand?.personal_details?.phone || "",
                    email: cand?.personal_details?.email || "",
                    application_number: appNo,
                    registration_number: regNo,
                    transaction_date: doc.transaction_date ? (doc.transaction_date.$date || doc.transaction_date) : doc.updatedAt || "",
                    status: doc.status || "SUCCESS",
                    fees_breakup: {
                        aided_fees: doc.aided_fees || [],
                        aided_management_fees: doc.aided_management_fees || [],
                        management_fees: doc.management_fees || []
                    },
                    raw: doc
                });
            });
        } catch (e: any) {
            console.warn("Could not query fee_collection.admission_fees collection:", e.message);
        }

        // --- ADMISSION FEES SWIPE: fee_collection.swipepayments ---
        try {
            const feeSwipeCol = mongoose.connection.useDb('fee_collection').collection('swipepayments');
            const feeSwipes = await feeSwipeCol.find({ "status": { $in: ["SWIPE_RECORDED", "SUCCESS"] } }).toArray();
            console.log(`[Refund API] Swipe payments found: ${feeSwipes.length}`);

            feeSwipes.forEach((doc: any) => {
                const appNo = doc.application_number ? String(doc.application_number).trim() : "";
                const regNo = doc.registration_number ? String(doc.registration_number).trim() : "";

                // Lookup candidate info
                const cand = candidateMapByReg.get(regNo) || candidateMapByApp.get(appNo);

                rawAdmissionPayments.push({
                    id: String(doc._id),
                    payment_type: 'admission_fee',
                    source: 'fee_collection.swipepayments (Swipe)',
                    order_id: doc.swipe_no || doc.order_id || "",
                    tracking_id: doc.tracking_id || "",
                    bank_ref_no: doc.bank_ref_no || "",
                    amount: parseFloat(doc.total_amount || '0'),
                    fullName: doc.fullName || cand?.personal_details?.fullName || "",
                    phone: cand?.personal_details?.phone || "",
                    email: cand?.personal_details?.email || "",
                    application_number: appNo,
                    registration_number: regNo,
                    transaction_date: doc.transaction_date || doc.createdAt || "",
                    status: doc.status || "SWIPE_RECORDED",
                    raw: doc
                });
            });
        } catch (e: any) {
            console.warn("Could not query fee_collection.swipepayments collection:", e.message);
        }

        // Helper to deduplicate logs (CCAvenue gateway logs vs fee breakup / system logs)
        const deduplicatePayments = (paymentsList: UnifiedPayment[]): UnifiedPayment[] => {
            const deduped: UnifiedPayment[] = [];
            const trackingMap = new Map<string, UnifiedPayment>();
            const orderMap = new Map<string, UnifiedPayment>();

            paymentsList.forEach((p) => {
                const trackKey = p.tracking_id ? String(p.tracking_id).trim() : "";
                const orderKey = p.order_id ? String(p.order_id).trim() : "";

                let existing: UnifiedPayment | undefined;

                if (trackKey && trackingMap.has(trackKey)) {
                    existing = trackingMap.get(trackKey);
                } else if (orderKey && orderMap.has(orderKey)) {
                    existing = orderMap.get(orderKey);
                }

                if (existing) {
                    // Reconcile and Merge
                    if (!existing.tracking_id && p.tracking_id) existing.tracking_id = p.tracking_id;
                    if (!existing.order_id && p.order_id) existing.order_id = p.order_id;
                    if (!existing.bank_ref_no && p.bank_ref_no) existing.bank_ref_no = p.bank_ref_no;
                    if (!existing.application_number && p.application_number) existing.application_number = p.application_number;
                    if (!existing.registration_number && p.registration_number) existing.registration_number = p.registration_number;
                    if (!existing.fullName && p.fullName) existing.fullName = p.fullName;
                    if (!existing.phone && p.phone) existing.phone = p.phone;
                    if (!existing.email && p.email) existing.email = p.email;
                    if (!existing.course_name && p.course_name) existing.course_name = p.course_name;
                    if (!existing.stream && p.stream) existing.stream = p.stream;
                    if (!existing.programme_type && p.programme_type) existing.programme_type = p.programme_type;

                    if (!existing.source.includes(p.source)) {
                        existing.source = `${existing.source} & ${p.source}`;
                    }

                    if (p.fees_breakup) {
                        existing.fees_breakup = p.fees_breakup;
                    }

                    if (p.amount > existing.amount) {
                        existing.amount = p.amount;
                    }
                } else {
                    const newPay = { ...p };
                    deduped.push(newPay);
                    if (trackKey) trackingMap.set(trackKey, newPay);
                    if (orderKey) orderMap.set(orderKey, newPay);
                }
            });

            return deduped;
        };

        // Resolve course_name, stream, and programme_type for raw payments
        const resolveAllDetails = (p: UnifiedPayment) => {
            const details = resolveProgramDetails(p, candidateMapByReg, candidateMapByApp, candidateMapByPhone, candidateMapByEmail);
            p.course_name = details.course_name;
            p.stream = details.stream;
            p.programme_type = details.programme_type;
        };

        rawApplicationPayments.forEach(resolveAllDetails);
        rawAdmissionPayments.forEach(resolveAllDetails);

        // 3a. Fetch candidate_fees_master to associate real fee structures/breakups to all admission payments
        const feesMasterMap = new Map<string, any>();
        try {
            const appNumbersForFees = new Set<any>();
            rawAdmissionPayments.forEach(p => {
                const numStr = String(p.application_number || '').trim();
                if (numStr && numStr !== 'null' && numStr !== 'undefined') {
                    appNumbersForFees.add(numStr);
                    const parsed = parseInt(numStr, 10);
                    if (!isNaN(parsed)) {
                        appNumbersForFees.add(parsed);
                    }
                }
            });

            if (appNumbersForFees.size > 0) {
                const candidateFeesMasterCol = mongoose.connection.useDb('admission2026').collection('candidate_fees_master');
                const feesMasterRecords = await candidateFeesMasterCol.find({
                    application_number: { $in: Array.from(appNumbersForFees) }
                }).toArray();

                feesMasterRecords.forEach((rec: any) => {
                    if (rec.application_number !== undefined && rec.application_number !== null) {
                        feesMasterMap.set(String(rec.application_number).trim(), rec.fees);
                    }
                });
            }
        } catch (e: any) {
            console.warn("Could not query candidate_fees_master collection:", e.message);
        }

        // Apply mapped fee structure from candidate_fees_master to admission payments
        rawAdmissionPayments.forEach(p => {
            if (p.payment_type === 'admission_fee') {
                const appNoKey = String(p.application_number || '').trim();
                const matchedFees = feesMasterMap.get(appNoKey);
                if (matchedFees) {
                    p.fees_breakup = {
                        aided_fees: matchedFees.aided_fees || [],
                        aided_management_fees: matchedFees.aided_management_fees || [],
                        management_fees: matchedFees.management_fees || []
                    };
                }
            }
        });

        // Reconcile/Deduplicate both streams to prevent double counting
        const dedupedApplicationPayments = deduplicatePayments(rawApplicationPayments);
        const dedupedAdmissionPayments = deduplicatePayments(rawAdmissionPayments);

        // Attach refund statuses to unified payments
        const attachRefundDetails = (p: UnifiedPayment) => {
            const orderId = p.order_id ? String(p.order_id).trim() : "";
            const trackingId = p.tracking_id ? String(p.tracking_id).trim() : "";

            let refundDoc: any = null;
            if (orderId && orderId !== "undefined" && orderId !== "null" && orderId !== "") {
                refundDoc = refundMap.get(orderId);
            }
            if (!refundDoc && trackingId && trackingId !== "undefined" && trackingId !== "null" && trackingId !== "") {
                refundDoc = refundMap.get(trackingId);
            }

            if (refundDoc) {
                p.refund_status = refundDoc.status || 'refund_initiated';
                p.refund_details = {
                    refund_amount: refundDoc.refund_amount,
                    reason: refundDoc.reason,
                    refund_remarks: refundDoc.refund_remarks || "",
                    moved_at: refundDoc.moved_at,
                    staff_id: refundDoc.staff_id
                };
            } else {
                p.refund_status = 'not_refunded';
            }
        };

        dedupedApplicationPayments.forEach(attachRefundDetails);
        dedupedAdmissionPayments.forEach(attachRefundDetails);

        // 3. Query all payment_initiated documents from admission2026 database for Application duplicate course checks
        const appOrderIds = dedupedApplicationPayments.map(p => p.order_id).filter(Boolean);
        const initiatedMap = new Map<string, any>();
        try {
            const paymentInitiatedCol = mongoose.connection.useDb('admission2026').collection('payment_initiated');
            const initiatedPayments = await paymentInitiatedCol.find({ orderId: { $in: appOrderIds } }).toArray();
            initiatedPayments.forEach((ip: any) => {
                if (ip.orderId) {
                    initiatedMap.set(String(ip.orderId).trim(), ip);
                }
            });
        } catch (e: any) {
            console.warn("Could not query payment_initiated collection:", e.message);
        }

        // 4. GROUPING & COURSE DUPLICATION FOR APPLICATION FEES
        const appFeeGroups = new Map<string, UnifiedPayment[]>();
        dedupedApplicationPayments.forEach((p) => {
            const phoneKey = normalizePhone(p.phone);
            const emailKey = normalizeEmail(p.email);
            const key = phoneKey || emailKey;

            if (key) {
                if (!appFeeGroups.has(key)) appFeeGroups.set(key, []);
                appFeeGroups.get(key)!.push(p);
            }
        });

        const allApplicationFees = Array.from(appFeeGroups.values())
            .map(group => {
                const leader = group.find(g => g.fullName) || group[0];

                // Find candidate matching this group to retrieve application count/courses
                let cand: any = null;
                for (const p of group) {
                    if (p.registration_number) {
                        cand = candidateMapByReg.get(String(p.registration_number).trim());
                    }
                    if (!cand && p.application_number) {
                        cand = candidateMapByApp.get(String(p.application_number).trim());
                    }
                    if (!cand) {
                        const normalizedP = normalizePhone(p.phone);
                        if (normalizedP) cand = candidateMapByPhone.get(normalizedP);
                    }
                    if (!cand) {
                        const normalizedE = normalizeEmail(p.email);
                        if (normalizedE) cand = candidateMapByEmail.get(normalizedE);
                    }
                    if (cand) break;
                }

                let feePerProgram = 100; // default to UG
                let programmeType = 'UG';
                if (cand) {
                    programmeType = cand.appliedProgrammeType || cand.academic_background?.programmeType || 'UG';
                    feePerProgram = programmeType === 'PG' ? 200 : 100;
                } else {
                    for (const p of group) {
                        const ip = initiatedMap.get(p.order_id);
                        if (ip && ip.candidateDetails?.personal_details?.application_info) {
                            const appInfo = ip.candidateDetails.personal_details.application_info;
                            if (appInfo.fee_per_program) feePerProgram = Number(appInfo.fee_per_program);
                            else if (appInfo.application_type === 'PG') feePerProgram = 200;
                        }
                    }
                }

                // Parse courses paid per payment from payment_initiated
                const paymentCourses = new Map<string, string[]>(); // order_id -> course codes
                group.forEach(p => {
                    const ip = initiatedMap.get(p.order_id);
                    const courseCodes: string[] = [];
                    if (ip && ip.candidateDetails?.selected_courses) {
                        const selCourses = ip.candidateDetails.selected_courses;
                        if (Array.isArray(selCourses)) {
                            selCourses.forEach((item: any) => {
                                if (item) {
                                    if (item.course && item.course.code) {
                                        courseCodes.push(String(item.course.code).trim());
                                    } else if (item.course_code) {
                                        courseCodes.push(String(item.course_code).trim());
                                    } else if (item.code) {
                                        courseCodes.push(String(item.code).trim());
                                    }
                                }
                            });
                        }
                    }
                    paymentCourses.set(p.order_id, courseCodes);
                });

                // Chronological duplication check (earliest payment owns the course seat)
                const sortedPayments = [...group].sort((a, b) => {
                    const dateA = new Date(a.transaction_date).getTime();
                    const dateB = new Date(b.transaction_date).getTime();
                    return dateA - dateB;
                });

                const seenCourses = new Set<string>();
                const duplicateCoursesInGroup = new Set<string>();
                let hasCourseLevelDuplication = false;

                sortedPayments.forEach(p => {
                    const courses = paymentCourses.get(p.order_id) || [];
                    const duplicatesForThisPayment: string[] = [];
                    courses.forEach(code => {
                        if (seenCourses.has(code)) {
                            duplicatesForThisPayment.push(code);
                            duplicateCoursesInGroup.add(code);
                            hasCourseLevelDuplication = true;
                        } else {
                            seenCourses.add(code);
                        }
                    });

                    if (duplicatesForThisPayment.length > 0) {
                        p.duplicate_courses = duplicatesForThisPayment;
                    }
                    p.selected_courses = courses;
                });

                // Fallback checks
                let coursesCount = 0;
                if (cand?.application_preferences?.applications) {
                    coursesCount = cand.application_preferences.applications.length;
                } else {
                    group.forEach(p => {
                        const ip = initiatedMap.get(p.order_id);
                        if (ip && ip.candidateDetails?.personal_details?.application_info?.application_count) {
                            coursesCount = Math.max(coursesCount, Number(ip.candidateDetails.personal_details.application_info.application_count));
                        }
                    });
                }

                if (coursesCount === 0) {
                    coursesCount = seenCourses.size || group.length;
                }

                const totalPaid = group.reduce((sum, p) => sum + p.amount, 0);
                const expectedFee = coursesCount * feePerProgram;
                const totalPaidExceedsExpected = totalPaid > expectedFee;

                const orderIdCounts: { [key: string]: number } = {};
                group.forEach(p => {
                    if (p.order_id) {
                        orderIdCounts[p.order_id] = (orderIdCounts[p.order_id] || 0) + 1;
                    }
                });
                const hasDoublePayment = Object.values(orderIdCounts).some(count => count > 1);

                const bhcAdmPayments = group.filter(p => p.order_id && p.order_id.toUpperCase().startsWith('BHC-ADM-'));
                const hasMultipleAdmPayments = bhcAdmPayments.length > 1;

                const isDuplicate = group.length > 1 && (hasCourseLevelDuplication || hasDoublePayment || hasMultipleAdmPayments || totalPaidExceedsExpected);

                // Gather all unique application numbers for this candidate group
                const appNumbersSet = new Set<string>();
                if (cand?.application_preferences?.applications) {
                    cand.application_preferences.applications.forEach((app: any) => {
                        if (app.application_number) {
                            appNumbersSet.add(String(app.application_number).trim());
                        }
                    });
                }
                group.forEach(p => {
                    if (p.application_number && p.application_number !== 'null' && p.application_number !== 'undefined') {
                        String(p.application_number).split(',').forEach(num => {
                            const trimmed = num.trim();
                            if (trimmed) appNumbersSet.add(trimmed);
                        });
                    }
                });
                const applicationNumbers = Array.from(appNumbersSet).filter(Boolean);
                const resolvedAppNumberString = applicationNumbers.length > 0
                    ? applicationNumbers.join(', ')
                    : (leader.application_number || "");

                return {
                    candidate_info: {
                        fullName: leader.fullName,
                        phone: leader.phone,
                        email: leader.email,
                        application_number: resolvedAppNumberString,
                        registration_number: leader.registration_number || (cand?.registration_number ? String(cand.registration_number) : ""),
                        coursesCount,
                        feePerProgram,
                        programmeType,
                        totalPaid,
                        expectedFee,
                        duplicateCourses: Array.from(duplicateCoursesInGroup),
                        selectedCourses: Array.from(seenCourses),
                        is_admitted: checkIsAdmitted(cand)
                    },
                    is_duplicate: isDuplicate,
                    payments: group
                };
            });

        // 5. GROUPING & DUPLICATION FOR ADMISSION FEES
        const admissionFeeGroups: Array<{
            candidate_info: {
                fullName: string;
                phone: string;
                email: string;
                application_number: string;
                registration_number: string;
            };
            payments: UnifiedPayment[];
        }> = [];

        dedupedAdmissionPayments.forEach((p) => {
            let matchedGroup = admissionFeeGroups.find(group => {
                const info = group.candidate_info;

                if (p.application_number && info.application_number && String(p.application_number).trim() === String(info.application_number).trim()) {
                    return true;
                }
                if (p.registration_number && info.registration_number && String(p.registration_number).trim() === String(info.registration_number).trim()) {
                    return true;
                }
                const pPhone = normalizePhone(p.phone);
                const gPhone = normalizePhone(info.phone);
                if (pPhone && gPhone && pPhone === gPhone) {
                    return true;
                }
                const pEmail = normalizeEmail(p.email);
                const gEmail = normalizeEmail(info.email);
                if (pEmail && gEmail && pEmail === gEmail) {
                    return true;
                }
                return false;
            });

            if (matchedGroup) {
                matchedGroup.payments.push(p);
                if (!matchedGroup.candidate_info.fullName && p.fullName) matchedGroup.candidate_info.fullName = p.fullName;
                if (!matchedGroup.candidate_info.phone && p.phone) matchedGroup.candidate_info.phone = p.phone;
                if (!matchedGroup.candidate_info.email && p.email) matchedGroup.candidate_info.email = p.email;
                if (!matchedGroup.candidate_info.application_number && p.application_number) matchedGroup.candidate_info.application_number = p.application_number;
                if (!matchedGroup.candidate_info.registration_number && p.registration_number) matchedGroup.candidate_info.registration_number = p.registration_number;
            } else {
                admissionFeeGroups.push({
                    candidate_info: {
                        fullName: p.fullName,
                        phone: p.phone,
                        email: p.email,
                        application_number: p.application_number,
                        registration_number: p.registration_number
                    },
                    payments: [p]
                });
            }
        });

        const allAdmissionFees = admissionFeeGroups.map(group => {
            // Find candidate matching this group to retrieve accurate details
            let cand: any = null;
            for (const p of group.payments) {
                if (p.registration_number) {
                    cand = candidateMapByReg.get(String(p.registration_number).trim());
                }
                if (!cand && p.application_number) {
                    cand = candidateMapByApp.get(String(p.application_number).trim());
                }
                if (!cand) {
                    const normalizedP = normalizePhone(p.phone);
                    if (normalizedP) cand = candidateMapByPhone.get(normalizedP);
                }
                if (!cand) {
                    const normalizedE = normalizeEmail(p.email);
                    if (normalizedE) cand = candidateMapByEmail.get(normalizedE);
                }
                if (cand) break;
            }

            // Gather all unique application numbers for this candidate group
            const appNumbersSet = new Set<string>();
            if (cand?.application_preferences?.applications) {
                cand.application_preferences.applications.forEach((app: any) => {
                    if (app.application_number) {
                        appNumbersSet.add(String(app.application_number).trim());
                    }
                });
            }
            group.payments.forEach(p => {
                if (p.application_number && p.application_number !== 'null' && p.application_number !== 'undefined') {
                    String(p.application_number).split(',').forEach(num => {
                        const trimmed = num.trim();
                        if (trimmed) appNumbersSet.add(trimmed);
                    });
                }
            });
            const applicationNumbers = Array.from(appNumbersSet).filter(Boolean);
            const resolvedAppNumberString = applicationNumbers.length > 0
                ? applicationNumbers.join(', ')
                : (group.candidate_info.application_number || "");

            // Map candidate preference applications for detailed per-application rendering
            const admittedStatuses = ['ADMITTED', 'ADMIT_FINAL', 'ADMIT', 'ADMISSION'];
            const candidateApplications = (cand?.application_preferences?.applications || []).map((app: any) => ({
                application_number: app.application_number ? String(app.application_number) : "",
                program_name: app.program_name || "",
                stream: app.stream || "",
                application_type: app.application_type || "",
                status: app.status || "",
                is_admitted: admittedStatuses.includes(app.status) || app.admission_details?.admit_status === 'Yes'
            }));

            const updatedCandidateInfo = {
                ...group.candidate_info,
                application_number: resolvedAppNumberString,
                registration_number: group.candidate_info.registration_number || (cand?.registration_number ? String(cand.registration_number) : ""),
                is_admitted: checkIsAdmitted(cand),
                applications: candidateApplications
            };

            const orderIdCounts: { [key: string]: number } = {};
            const trackingIdCounts: { [key: string]: number } = {};
            const appNumCounts: { [key: string]: number } = {};

            group.payments.forEach(p => {
                if (p.order_id) {
                    orderIdCounts[p.order_id] = (orderIdCounts[p.order_id] || 0) + 1;
                }
                if (p.tracking_id) {
                    trackingIdCounts[p.tracking_id] = (trackingIdCounts[p.tracking_id] || 0) + 1;
                }
                if (p.application_number) {
                    appNumCounts[p.application_number] = (appNumCounts[p.application_number] || 0) + 1;
                }
            });

            const hasDoubleOrder = Object.values(orderIdCounts).some(count => count > 1);
            const hasDoubleTrack = Object.values(trackingIdCounts).some(count => count > 1);
            const hasDoubleApp = Object.values(appNumCounts).some(count => count > 1);
            const hasMultiplePayments = group.payments.length > 1;

            const isDuplicate = group.payments.length > 1 && (hasDoubleOrder || hasDoubleTrack || hasDoubleApp || hasMultiplePayments);

            return {
                candidate_info: updatedCandidateInfo,
                is_duplicate: isDuplicate,
                payments: group.payments
            };
        });

        return res.status(200).json({
            success: true,
            summary: {
                total_payments_scanned: dedupedApplicationPayments.length + dedupedAdmissionPayments.length,
                total_application_groups: allApplicationFees.length,
                duplicate_application_groups: allApplicationFees.filter(g => g.is_duplicate).length,
                total_admission_groups: allAdmissionFees.length,
                duplicate_admission_groups: allAdmissionFees.filter(g => g.is_duplicate).length
            },
            data: {
                application_fees: allApplicationFees,
                admission_fees: allAdmissionFees
            }
        });

    } catch (error: any) {
        console.error("Error in getDuplicatePayments controller:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error scanning duplicate payments",
            error: error.message
        });
    }
};

/**
 * Controller to initiate refund for a specific duplicate payment.
 */
export const initiateDuplicateRefund = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            order_id,
            tracking_id,
            source_collection,
            refund_amount,
            reason,
            refund_remarks,
            fee_type,
            staff_id,
            staff_name,
            performed_by,
            refund_bank_details,
            refund_amount_detail
        } = req.body;

        if (!order_id && !tracking_id) {
            return res.status(400).json({
                success: false,
                message: "order_id or tracking_id is required to identify the transaction"
            });
        }

        if (!source_collection) {
            return res.status(400).json({
                success: false,
                message: "source_collection is required"
            });
        }

        // 1. Check if refund is already initiated in the new collection
        const refundInitiateCol = mongoose.connection.useDb('fee_collection').collection('refund_initiate');
        const query: any = {};
        if (order_id) query.order_id = order_id;
        else if (tracking_id) query.tracking_id = tracking_id;

        const existingRefund = await refundInitiateCol.findOne(query);
        if (existingRefund) {
            return res.status(400).json({
                success: false,
                message: `Refund already initiated for this transaction. Current Status: ${existingRefund.status || 'refund_initiated'}`
            });
        }

        // 2. Fetch the original payment from the specific collection to gather transaction details
        let paymentRecord: any = null;
        let dbName = "ccavenue_payment";
        let collectionName = source_collection;

        // Determine correct db and collection
        // Order matters: check swipe/ccavenue BEFORE generic fee_collection to handle merged sources
        if (source_collection.toLowerCase().includes("swipe") || source_collection === "swipepayments") {
            dbName = "fee_collection";
            collectionName = "swipepayments";
        } else if (source_collection.includes("ccavenue_admissions") || source_collection === "ccavenue_admissions") {
            dbName = "ccavenue_payment";
            collectionName = "ccavenue_admissions";
        } else if (source_collection.includes("ccavenue_admission_fee") || source_collection === "ccavenue_admission_fee") {
            dbName = "ccavenue_payment";
            collectionName = "ccavenue_admission_fee";
        } else if (source_collection.includes("ccavenue_admission") || source_collection === "ccavenue_admission") {
            dbName = "ccavenue_payment";
            collectionName = "ccavenue_admission";
        } else if (source_collection.includes("fee_collection") || source_collection === "admission_fees") {
            dbName = "fee_collection";
            collectionName = "admission_fees";
        } else {
            dbName = "ccavenue_payment";
            collectionName = "ccavenue_admissions";
        }

        const targetDbCol = mongoose.connection.useDb(dbName).collection(collectionName);
        const searchQuery: any = {};
        if (dbName === "ccavenue_payment") {
            if (order_id) searchQuery["data.order_id"] = order_id;
            else searchQuery["data.tracking_id"] = tracking_id;
        } else {
            // For fee_collection
            if (collectionName === "swipepayments") {
                if (order_id) searchQuery.swipe_no = order_id;
                else searchQuery.tracking_id = { $regex: tracking_id };
            } else {
                if (order_id) searchQuery.order_id = order_id;
                else searchQuery.tracking_id = tracking_id;
            }
        }

        paymentRecord = await targetDbCol.findOne(searchQuery);

        // USER FEEDBACK FIX: If not found in primary collection, check other ccavenue collections to confirm
        if (!paymentRecord) {
            const fallbackCollections = ["ccavenue_admission", "ccavenue_admission_fee", "ccavenue_admissions"];
            for (const col of fallbackCollections) {
                if (dbName === "ccavenue_payment" && col === collectionName) continue;
                try {
                    const fallbackCol = mongoose.connection.useDb("ccavenue_payment").collection(col);
                    // Search using appropriate query for ccavenue_payment structure
                    const ccSearchQuery: any = {};
                    if (order_id) ccSearchQuery["data.order_id"] = order_id;
                    else ccSearchQuery["data.tracking_id"] = tracking_id;

                    const rec = await fallbackCol.findOne(ccSearchQuery);
                    if (rec) {
                        paymentRecord = rec;
                        dbName = "ccavenue_payment";
                        collectionName = col; // Dynamically switch to found collection
                        break;
                    }
                } catch (err: any) {
                    console.warn(`Fallback query in ${col} failed:`, err.message);
                }
            }
        }

        if (!paymentRecord) {
            return res.status(404).json({
                success: false,
                message: `Original payment record not found in ${dbName}.${collectionName} collection`
            });
        }

        // Extract transaction details based on source format
        let txnOrderId = order_id;
        let txnTrackingId = tracking_id;
        let txnBankRefNo = "N/A";
        let txnAmount = 0;
        let txnName = "Candidate";
        let txnPhone = "";
        let txnEmail = "";

        if (dbName === "ccavenue_payment") {
            const data = paymentRecord.data || {};
            txnOrderId = data.order_id || order_id;
            txnTrackingId = data.tracking_id || tracking_id;
            txnBankRefNo = data.bank_ref_no || "N/A";
            txnAmount = parseFloat(data.amount || '0');
            txnName = data.billing_name || "Candidate";
            txnPhone = data.billing_tel || "";
            txnEmail = data.billing_email || "";
        } else {
            // fee_collection
            txnOrderId = paymentRecord.swipe_no || paymentRecord.order_id || paymentRecord.student_id || order_id;
            txnTrackingId = paymentRecord.tracking_id || tracking_id;
            txnBankRefNo = paymentRecord.bank_ref_no || "N/A";
            txnAmount = parseFloat(paymentRecord.total_amount || paymentRecord.amount || '0');
            txnName = paymentRecord.fullName || "Candidate";
        }

        // Extract registration_number and application_number from payment record
        let registration_number = "";
        let application_number = "";
        if (dbName === "ccavenue_payment") {
            const data = paymentRecord.data || {};
            const resolvedFeeType = fee_type || (source_collection.includes("admission") ? "admission_fee" : "application_fee");
            if (source_collection === "ccavenue_admissions" || resolvedFeeType === "application_fee") {
                // Application fee: merchant_param1 = reg_no, merchant_param4 = app_no
                registration_number = data.merchant_param1 || "";
                application_number = data.merchant_param4 || "";
            } else {
                // Admission fee: merchant_param4 = reg_no, merchant_param1 = app_no
                registration_number = data.merchant_param4 || "";
                application_number = data.merchant_param1 || "";
            }
        } else {
            registration_number = paymentRecord.student_id || paymentRecord.registration_number || "";
            // For swipe payments, application_number may not exist; fallback to candidate details
            application_number = paymentRecord.application_number || "";
        }

        // 3. Save to refund collection (refund_initiate in fee_collection)
        const refundPayload = {
            order_id: txnOrderId,
            tracking_id: txnTrackingId,
            bank_ref_no: txnBankRefNo,
            amount: txnAmount,
            refund_amount: refund_amount || txnAmount,
            status: "refund_initiated",
            performed_by: performed_by ? {
                staff_id: performed_by.staff_id,
                staff_name: performed_by.staff_name,
                timestamp: new Date()
            } : {
                staff_id: staff_id || "System_Refund",
                staff_name: staff_name || "System",
                timestamp: new Date()
            },
            reason: reason || "Duplicate payment refund",
            refund_remarks: refund_remarks || "",
            fee_type: fee_type || (source_collection.includes("admission") ? "admission_fee" : "application_fee"),
            moved_at: new Date(),
            registration_number,
            application_number,
            candidateDetails: {
                personal_details: {
                    basic_info: {
                        name: txnName
                    },
                    contact_info: {
                        mobile: txnPhone,
                        email: txnEmail
                    }
                }
            },
            refund_bank_details: refund_bank_details || null,
            refund_amount_detail: refund_amount_detail || null,
            metadata: paymentRecord.metadata || {},
            source_db: dbName,
            source_collection: collectionName,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await refundInitiateCol.insertOne(refundPayload);

        // 4. Update status in original collection to prevent duplicate refund triggers,
        // and unset the old refund keys if present to prevent issues with other systems/old keys.
        try {
            if (dbName === "ccavenue_payment") {
                await targetDbCol.updateOne(
                    { _id: paymentRecord._id },
                    {
                        $set: {
                            "data.refund_initiate": {
                                status: "initiated",
                                initiated: true,
                                date: new Date(),
                                reason: reason,
                                refund_remarks: refund_remarks || "",
                                refund_amount: refund_amount || txnAmount,
                                fee_type: fee_type || "application_fee"
                            }
                        },
                        $unset: {
                            "data.refund_status": "",
                            "data.refund_initiated": ""
                        }
                    }
                );
            } else {
                await targetDbCol.updateOne(
                    { _id: paymentRecord._id },
                    {
                        $set: {
                            refund_initiate: {
                                status: "initiated",
                                initiated: true,
                                date: new Date(),
                                reason: reason,
                                refund_remarks: refund_remarks || "",
                                refund_amount: refund_amount || txnAmount,
                                fee_type: fee_type || "admission_fee"
                            }
                        },
                        $unset: {
                            refund_status: "",
                            refund_initiated: ""
                        }
                    }
                );
            }
        } catch (updateErr: any) {
            console.error(`Failed to update refund status in original payment doc:`, updateErr.message);
        }

        return res.status(200).json({
            success: true,
            message: "Refund request initiated successfully",
            refund: refundPayload
        });

    } catch (error: any) {
        console.error("Error in initiateDuplicateRefund controller:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error initiating refund",
            error: error.message
        });
    }
};

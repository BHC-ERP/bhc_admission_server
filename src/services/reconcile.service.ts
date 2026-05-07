
import mongoose from 'mongoose';
import CandidateAdmission from '../models/candidate.model';
import { createPaymentAuditLog } from './auditlog.service';
import { addMoreCandidateCoursesService } from './candidate.service';
import { candidateSignup } from '../controllers/auth/auth.controller';
import { Request, Response } from 'express';
import { formatPaymentDate } from '../utils/dateFormat';

export interface ReconcileItem {
    orderId: string;
    isShipped: boolean;
    isAddMore: boolean;
    candidateId?: string; // Optional ID for direct lookup
    candidateDetails: any;
    amount: number;
    transactionId: string;
    paymentDate: string;
    bankRefNo: string;
    actualStatus: string;
}

export const reconcileSingleOrder = async (item: ReconcileItem, staff_id: string = 'System_Auto') => {
    const { orderId, isShipped, isAddMore, candidateId, candidateDetails, amount, transactionId, paymentDate, bankRefNo, actualStatus } = item;

    try {
        console.log(`[Reconcile] Processing Order: ${orderId} (isAddMore: ${isAddMore})`);

        // Skip if status is 'Not Found in Excel' or 'Awaited'
        if (actualStatus === 'Not Found in Excel' || actualStatus === 'Awaited') {
            return { orderId, status: "Skipped", message: `Status is ${actualStatus}` };
        }

        if (isShipped) {
            const mobile = candidateDetails?.personal_details?.contact_info?.mobile;
            const aadhar = candidateDetails?.personal_details?.basic_info?.aadhar_number;

            if (!mobile && !candidateId) throw new Error("Mobile or CandidateID required for reconciliation");

            let existing = null;

            // Priority 1: Direct Candidate ID (for Add More)
            if (candidateId) {
                existing = await CandidateAdmission.findById(candidateId);
            }

            // Priority 2: Mobile / Aadhar (for Registration or Fallback)
            if (!existing && mobile) {
                const query: any = { "personal_details.phone": mobile };
                if (aadhar) {
                    existing = await CandidateAdmission.findOne({
                        $or: [
                            query,
                            { "personal_details.aadharNumber": aadhar }
                        ]
                    });
                } else {
                    existing = await CandidateAdmission.findOne(query);
                }
            }

            if (isAddMore) {
                if (!existing) {
                    console.error(`[Reconcile] Add More Failed: Candidate not found for Order ${orderId} (Mobile: ${mobile}, ID: ${candidateId})`);
                    throw new Error("Candidate not found for Add More");
                }

                const selected_courses = candidateDetails?.selected_courses;
                if (!selected_courses || selected_courses.length === 0) {
                    console.warn(`[Reconcile] Add More Warning: No courses found in candidateDetails for Order ${orderId}`);
                }

                console.log(`[Reconcile] Adding courses to Candidate: ${existing._id} for Order: ${orderId}`);
                await addMoreCandidateCoursesService(existing._id.toString(), selected_courses, {
                    amount_paid: amount ? parseFloat(amount.toString()) : 0,
                    transaction_id: transactionId,
                    transaction_date: formatPaymentDate(paymentDate) || new Date().toISOString(),
                    payment_method: "ccavenue_missed"
                });

                await createPaymentAuditLog({
                    personal_details: candidateDetails,
                    selected_courses,
                    payment_details: {
                        payment_method: "ccavenue_missed",
                        amount_paid: amount ? parseFloat(amount.toString()) : 0,
                        status: "Success",
                        transaction_id: transactionId,
                        bank_ref_no: bankRefNo || null,
                        transaction_date: formatPaymentDate(paymentDate) || new Date().toISOString(),
                        is_add_more: true
                    },
                    step_completed: candidateDetails?.step_completed
                });
                console.log(`[Reconcile] Add More Success for Order: ${orderId}`);
            } else {
                if (existing) {
                    // Double Payment / Duplicate check
                    const ccCollection = mongoose.connection.useDb('ccavenue_payment').collection('ccavenue_admissions');
                    const currentTx = await ccCollection.findOne({
                        "data.order_id": orderId,
                        "data.order_status": "Success"
                    });

                    if (currentTx) {
                        const pending = await mongoose.connection.collection('payment_initiated').findOne({ orderId });
                        if (pending) {
                            const { _id, ...insertData } = pending;
                            await mongoose.connection.collection('refund_payments').insertOne({
                                ...insertData,
                                status: "refund_initiated",
                                ccavenue_ref: currentTx.data.tracking_id,
                                bank_ref_no: currentTx.data.bank_ref_no,
                                refund_amount: currentTx.data.amount || pending.amount || 0,
                                staff_id: staff_id,
                                reason: `${currentTx.data.tracking_id}- ccavenue ref no order successfull status - ${currentTx.data.order_status} (Already Registered - Refund Needed)`,
                                moved_at: new Date()
                            });
                            await mongoose.connection.collection('payment_initiated').deleteOne({ _id: pending._id });
                            return { orderId, status: "Moved to Refund", message: "Already Existing - Extra Success Payment" };
                        }
                    } else {
                        await mongoose.connection.collection('payment_initiated').deleteOne({ orderId });
                        return { orderId, status: "Skipped", message: existing.personal_details?.phone === mobile ? "Mobile Already Registered" : "Aadhar Already Registered" };
                    }
                    return { orderId, status: "Processed", message: "Existing candidate handled" };
                }

                // New Candidate Registration
                const applicationInfo = candidateDetails.personal_details.application_info;
                const transformedBody = {
                    personal_details: {
                        ...candidateDetails.personal_details,
                        application_info: {
                            application_count: applicationInfo.application_count,
                            application_type: applicationInfo.application_type,
                            program_code: applicationInfo.program_codes,
                            program_names: applicationInfo.program_names,
                            program_streams: applicationInfo.program_streams
                        }
                    },
                    selected_courses: candidateDetails.selected_courses,
                    payment_details: {
                        payment_method: 'ccavenue_missed',
                        amount_paid: amount,
                        status: "success",
                        transaction_id: transactionId,
                        transaction_date: formatPaymentDate(paymentDate) || new Date(),
                        bank_ref_no: bankRefNo,
                    }
                };

                await createPaymentAuditLog({
                    personal_details: candidateDetails,
                    selected_courses: candidateDetails?.selected_courses || [],
                    payment_details: {
                        payment_method: "ccavenue_missed",
                        amount_paid: amount ? parseFloat(amount.toString()) : 0,
                        status: "Success",
                        transaction_id: transactionId,
                        bank_ref_no: bankRefNo || null,
                        transaction_date: formatPaymentDate(paymentDate) || new Date().toISOString()
                    },
                    step_completed: candidateDetails?.step_completed
                });

                // Prepare simulated Request/Response for candidateSignup
                const signupReq = { 
                    body: transformedBody, 
                    headers: { 'user-agent': 'Internal_Automation_Agent' },
                    ip: '127.0.0.1'
                } as Request;
                const signupRes = {
                    _statusCode: 200,
                    status: function (code: number) { this._statusCode = code; return this; },
                    json: function (data: any) { this.data = data; return this; },
                    data: null as any
                } as any;

                await candidateSignup(signupReq, signupRes as Response);

                if (signupRes._statusCode >= 400) {
                    throw new Error(signupRes.data?.message || `Signup failed with status ${signupRes._statusCode}`);
                }
            }

            // Secure cleanup
            const allPendingForUser = await mongoose.connection.collection('payment_initiated').find({
                "candidateDetails.personal_details.contact_info.mobile": candidateDetails?.personal_details?.contact_info?.mobile
            }).toArray();

            for (const pending of allPendingForUser) {
                const { _id, ...insertData } = pending;
                if (pending.orderId === orderId) {
                    await mongoose.connection.collection('missed_delete').updateOne(
                        { orderId: pending.orderId },
                        { $setOnInsert: { ...insertData, status: "Resolved", staff_id, moved_at: new Date() } },
                        { upsert: true }
                    );
                } else {
                    const ccCollection = mongoose.connection.useDb('ccavenue_payment').collection('ccavenue_admissions');
                    const extraTx = await ccCollection.findOne({
                        "data.order_id": pending.orderId,
                        "data.order_status": "Success"
                    });
                    if (extraTx) {
                        await mongoose.connection.collection('refund_payments').insertOne({
                            ...insertData,
                            status: "refund_initiated",
                            ccavenue_ref: extraTx.data.tracking_id,
                            bank_ref_no: extraTx.data.bank_ref_no,
                            refund_amount: extraTx.data.amount || pending.amount || 0,
                            staff_id,
                            reason: `Duplicate success - ${extraTx.data.tracking_id}`,
                            moved_at: new Date()
                        });
                    } else {
                        await mongoose.connection.collection('missed_delete').insertOne({
                            ...insertData,
                            status: "Resolved",
                            reason: "Duplicate session cleared",
                            staff_id,
                            moved_at: new Date()
                        });
                    }
                }
                await mongoose.connection.collection('payment_initiated').deleteOne({ _id: pending._id });
            }
            return { orderId, status: "Success" };
        } else {
            // Unsuccessful
            const auditLog = await mongoose.connection.collection('payment_initiated').findOne({ orderId });
            if (auditLog) {
                await mongoose.connection.collection('unsuccessful_payment').insertOne({
                    ...auditLog,
                    status: "Unsuccessful",
                    reason: `Excel Status - ${actualStatus || 'Dropped'}`,
                    staff_id,
                    moved_at: new Date()
                });
                await mongoose.connection.collection('payment_initiated').deleteOne({ _id: auditLog._id });
                return { orderId, status: "Moved to Unsuccessful" };
            }
            return { orderId, status: "Failed", message: "Not found" };
        }
    } catch (err: any) {
        return { orderId, status: "Error", message: err.message };
    }
};

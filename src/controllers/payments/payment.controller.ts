
import { Request, Response } from 'express';
import crypto from 'crypto';
import { candidateSignup, SignupRequest } from '../auth/auth.controller';
import { env } from '../../config/env';
import { createCandidateService } from '../../services/candidate.service';
import payment_log from '../../models/audit/payment_log';
import { createPaymentAuditLog } from '../../services/auditlog.service';
import CandidateAdmission from '../../models/candidate.model';
import { sendSMSService } from '../../services/sms.service';
import { sendMailService } from '../../services/mail.service';
import { addMoreCandidateCoursesService } from '../../services/candidate.service';
import { getCCAvenueConfig } from '../../config/ccavenue.config';
import mongoose from 'mongoose';

// Helper to decrypt CCAvenue response
function decryptCCAvenueResponse(encResp: string, workingKey: string): string {
    const md5 = crypto.createHash('md5').update(workingKey).digest();
    const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);

    const decipher = crypto.createDecipheriv('aes-128-cbc', md5, iv);
    let decrypted = decipher.update(encResp, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Helper to parse response string
function parseResponse(response: string): any {
    const params = new URLSearchParams(response);
    const result: any = {};
    for (const [key, value] of params) {
        result[key] = value;
    }
    return result;
}

// Store for pending payments (use Redis in production)
const pendingPayments = new Map();

// Free communities list (should match frontend)
const freeCommunities = ['SC', 'ST', 'SCA'];

// Direct save for exempted candidates (NRI, Reserved, Zero Fee)
export const directSaveApplication = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { candidateDetails, amount, exemptionReason } = req.body;

        if (!candidateDetails) {
            return res.status(400).json({
                message: "Candidate details are required"
            });
        }

        // Transform the data to match signup expectations
        const applicationInfo = candidateDetails.personal_details.application_info;

        const transformedBody = {
            personal_details: {
                basic_info: candidateDetails.personal_details.basic_info,
                contact_info: candidateDetails.personal_details.contact_info,
                address: candidateDetails.personal_details.address,
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
                ...candidateDetails.payment_details,
                payment_method: "ccavenue",
                amount_paid: amount || 0,
                status: "success",
                transaction_id: `EXEMPTED_${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                transaction_date: new Date().toISOString(),
                is_exempted: true,
                exemption_reason: exemptionReason || 'ZERO_FEE'
            }
        };

        // Create a new request object for signup
        const signupReq = {
            ...req,
            body: transformedBody
        } as Request<{}, {}, SignupRequest>;

        // Call the signup function
        const signupResponse = await candidateSignup(signupReq, res);

        // If we get here, signup was successful
        return res.status(200).json({
            status: 'success',
            message: 'Application saved successfully',
            data: {
                transaction_id: transformedBody.payment_details.transaction_id,
                amount: transformedBody.payment_details.amount_paid,
                exempted: true
            }
        });

    } catch (err: any) {
        console.error("Direct save error:", err);
        return res.status(500).json({
            message: err.message || "Server error during application save"
        });
    }
};

// Initiate CCAvenue payment
export const initiateCCAvenuePayment = async (req: Request, res: Response): Promise<Response> => {
    try {

        console.log("=== CCAvenue Payment Initiation Started ===");

        const { amount, candidateDetails } = req.body;

        console.log("Incoming Request Body:", JSON.stringify(req.body, null, 2));

        if (!candidateDetails) {
            console.log("❌ candidateDetails missing in request");
            return res.status(400).json({
                message: "Candidate details missing"
            });
        }

        console.log("Candidate Community:", candidateDetails?.personal_details?.basic_info?.community);
        console.log("Candidate NRI Status:", candidateDetails?.personal_details?.basic_info?.is_nri);
        console.log("Requested Amount:", amount);

        // Double-check exemption cases (security)
        const isReservedCandidate = freeCommunities.includes(
            candidateDetails.personal_details.basic_info.community
        );

        const isNRI = candidateDetails.personal_details.basic_info.is_nri === true;

        console.log("Reserved Candidate Check:", isReservedCandidate);
        console.log("NRI Candidate Check:", isNRI);

        // If exempted, should not reach here, but just in case
        if (amount === 0) {
            console.log("⚠️ Amount is 0, payment not required");
        }

        if (isReservedCandidate) {
            console.log("⚠️ Candidate belongs to reserved community. Payment should be free.");
        }

        if (isNRI) {
            console.log("⚠️ Candidate is NRI. Payment should be free.");
        }

        if (amount === 0 || isReservedCandidate || isNRI) {
            console.log("❌ Payment request rejected due to exemption condition");

            const responsePayload = {
                message: "Payment not required for this candidate",
                debug: {
                    amount,
                    isReservedCandidate,
                    isNRI
                }
            };

            console.log("Response JSON:", JSON.stringify(responsePayload, null, 2));

            return res.status(400).json(responsePayload);
        }

        console.log("✅ Candidate requires payment");

        // Generate unique order ID
        const orderId = `BHC-ADM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        console.log("Generated Order ID:", orderId);

        const origin = req.headers.origin || req.headers.referer || '';

        // Store pending payment data
        pendingPayments.set(orderId, {
            candidateDetails,
            amount,
            origin, // Save origin for the response handler
            timestamp: new Date().toISOString()
        });

        await mongoose.connection
            .collection("payment_initiated")
            .insertOne({
                candidateDetails,
                orderId,
                amount,
                origin,
                timestamp: new Date().toISOString()
            });

        console.log("Pending payment stored in memory for order:", orderId);

        // Set expiration after 1 hour
        setTimeout(() => {
            console.log("⏳ Payment expired. Removing order:", orderId);
            pendingPayments.delete(orderId);
        }, 60 * 60 * 1000);

        console.log("Generating CCAvenue encrypted request...");

        const ccConfig = getCCAvenueConfig(req);

        // Generate CCAvenue encrypted request
        const encRequest = generateCCAvenueEncRequest({
            order_id: orderId,
            amount: amount,
            currency: 'INR',
            redirect_url: ccConfig.redirectUrl,
            cancel_url: ccConfig.cancelUrl,
            language: 'EN',
            merchant_id: ccConfig.merchantId,
            customer_id: candidateDetails.personal_details.contact_info.email,
            customer_name: candidateDetails.personal_details.basic_info.name,
            customer_email: candidateDetails.personal_details.contact_info.email,
            customer_mobile: candidateDetails.personal_details.contact_info.mobile,
            billing_address: [
                candidateDetails.personal_details.address.present_address?.door_no,
                candidateDetails.personal_details.address.present_address?.street,
                candidateDetails.personal_details.address.present_address?.village_town,
                candidateDetails.personal_details.address.present_address?.district,
                candidateDetails.personal_details.address.present_address?.state,
                candidateDetails.personal_details.address.present_address?.country
            ].filter(Boolean).join(", "),
            billing_name: candidateDetails.personal_details.basic_info.name,
            billing_zip: candidateDetails.personal_details.address.present_address?.pincode,
            billing_city: candidateDetails.personal_details.address.present_address?.district,
            billing_state: candidateDetails.personal_details.address.present_address?.state,
            billing_country: candidateDetails.personal_details.address.present_address?.country,
            billing_email: candidateDetails.personal_details.contact_info.email,
            billing_tel: candidateDetails.personal_details.contact_info.mobile
        });

        console.log("Encrypted Request Generated Successfully");

        const responsePayload = {
            accessCode: ccConfig.accessCode,
            encRequest: encRequest,
            ccavenueUrl: ccConfig.paymentUrl
        };

        console.log("Returning Payment Initiation Response:");
        console.log(JSON.stringify(responsePayload, null, 2));

        console.log(`✅ Payment initiated successfully: OrderID=${orderId}, Amount=${amount}`);
        console.log("=== CCAvenue Payment Initiation Completed ===");

        await mongoose.connection.collection("payment_response").insertOne({
            orderId,
            responsePayload,
            timestamp: new Date().toISOString()
        });
        return res.status(200).json(responsePayload);

    } catch (err) {

        console.error("❌ CCAvenue payment initiation error:", err);

        const errorPayload = {
            message: "Server error during payment initiation",
            error: err instanceof Error ? err.message : "Unknown error"
        };

        console.log("Error Response JSON:", JSON.stringify(errorPayload, null, 2));

        return res.status(500).json(errorPayload);
    }
};

// Initiate "Add More Courses" payment for existing candidates
export const initiateAddMoreCoursesPayment = async (req: Request, res: Response): Promise<Response> => {
    try {
        console.log("=== Add More Courses Payment Initiation Started ===");
        const { amount, selected_courses, candidateId } = req.body;

        if (!candidateId || !selected_courses || !selected_courses.length) {
            return res.status(400).json({ message: "Candidate ID and selected courses are required" });
        }

        const candidate = await CandidateAdmission.findById(candidateId);
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        // Generate unique order ID
        const orderId = `BHC-ADD-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        // Transform candidate into candidateDetails format for audit log / failure page
        const candidateDetails = {
            personal_details: {
                basic_info: {
                    name: candidate.personal_details?.fullName,
                    gender: candidate.personal_details?.gender,
                    date_of_birth: candidate.personal_details?.dateOfBirth,
                    community: candidate.personal_details?.community,
                    is_nri: candidate.personal_details?.nationality !== 'Indian'
                },
                contact_info: {
                    mobile: candidate.personal_details?.phone,
                    email: candidate.personal_details?.email
                },
                application_info: {
                    application_count: (candidate as any).application_preferences?.applications?.length || 0,
                    application_type: candidate.appliedProgrammeType as "UG" | "PG",
                    program_code: (candidate as any).application_preferences?.applications?.map((app: any) => app.program_code) || [],
                    program_names: (candidate as any).application_preferences?.applications?.map((app: any) => app.program_name) || [],
                    program_streams: (candidate as any).application_preferences?.applications?.map((app: any) => app.stream) || []
                },
                address: candidate.address
            },
            selected_courses: selected_courses, // Newly selected courses for this transaction
            step_completed: 4
        };

        const origin = req.headers.origin || req.headers.referer || '';

        // --- Handle Free Add More Courses Directly ---
        if (amount === 0) {
            console.log("✅ Free Add More Courses detected. Saving directly...");

            const transaction_id = `BHC-ADD_EXEMPT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

            const result = await addMoreCandidateCoursesService(candidateId, selected_courses, {
                amount_paid: 0,
                transaction_id: transaction_id,
                transaction_date: new Date().toISOString(),
                payment_method: "exempted"
            });

            await createPaymentAuditLog({
                personal_details: { candidateId },
                selected_courses: selected_courses,
                payment_details: {
                    payment_method: "exempted",
                    amount_paid: 0,
                    status: "Success",
                    transaction_id: transaction_id,
                    transaction_date: new Date().toISOString(),
                    is_add_more: true,
                    is_exempted: true,
                    exemption_reason: 'ZERO_FEE'
                }
            });


            return res.status(200).json({
                status: 'success',
                message: 'Additional courses added successfully',
                data: result
            });
        }
        // --- End Handle Free ---

        // Store pending payment data with Add More context
        pendingPayments.set(orderId, {
            candidateId,
            candidateDetails, // Storing for failure audit log
            selected_courses,
            amount,
            isAddMore: true,
            origin, // Save origin for the response handler
            timestamp: new Date().toISOString()
        });

        await mongoose.connection
            .collection("payment_initiated")
            .insertOne({
                candidateId,
                candidateDetails,
                selected_courses,
                orderId,
                amount,
                origin,
                isAddMore: true,
                timestamp: new Date().toISOString()
            });
        // Set expiration after 1 hour
        setTimeout(() => pendingPayments.delete(orderId), 60 * 60 * 1000);

        const ccConfig = getCCAvenueConfig(req);

        // Generate CCAvenue encrypted request
        const encRequest = generateCCAvenueEncRequest({
            order_id: orderId,
            amount: amount,
            currency: 'INR',
            redirect_url: ccConfig.redirectUrl,
            cancel_url: ccConfig.cancelUrl,
            language: 'EN',
            merchant_id: ccConfig.merchantId,
            customer_id: candidate.personal_details?.email,
            customer_name: candidate.personal_details?.fullName,
            customer_email: candidate.personal_details?.email,
            customer_mobile: candidate.personal_details?.phone,
            billing_address: [
                candidate.address?.present_address?.door_no,
                candidate.address?.present_address?.street,
                candidate.address?.present_address?.village_town,
                candidate.address?.present_address?.district,
                candidate.address?.present_address?.state,
                candidate.address?.present_address?.country
            ].filter(Boolean).join(", "),
            billing_name: candidate.personal_details?.fullName,
            billing_zip: candidate.address?.present_address?.pincode,
            billing_city: candidate.address?.present_address?.district,
            billing_state: candidate.address?.present_address?.state,
            billing_country: candidate.address?.present_address?.country,
            billing_email: candidate.personal_details?.email,
            billing_tel: candidate.personal_details?.phone
        });

        return res.status(200).json({
            accessCode: ccConfig.accessCode,
            encRequest: encRequest,
            ccavenueUrl: ccConfig.paymentUrl
        });

    } catch (err) {
        console.error("❌ Add More Courses payment initiation error:", err);
        return res.status(500).json({
            message: "Server error during payment initiation",
            error: err instanceof Error ? err.message : "Unknown error"
        });
    }
};

// Handle CCAvenue payment response (success)
export const handleCCAvenueResponse = async (req: Request, res: Response): Promise<void> => {
    try {

        console.log("=========== CCAvenue Response Received ===========");
        console.log("Raw Body:", JSON.stringify(req.body, null, 2));

        const { encResp } = req.body;

        if (!encResp) {
            console.error("❌ No encryption response received from CCAvenue");

            // At this point we don't know the order_id, so we don't know the origin.
            // Best effort fallback to env.CCAVENUE_FRONTEND_URL
            const fallbackUrl = env.CCAVENUE_FRONTEND_URL;
            return res.redirect(`${fallbackUrl}/payment/response_not_received`);
        }

        console.log("Encrypted Response Length:", encResp.length);

        // We can't decrypt yet without knowing the origin, and we can't get origin
        // easily without decrypting the order_id.
        // BUT CCAvenue usually sends order_no in the unencrypted POST body as well.
        // Let's check if we can extract orderNo from req.body directly
        let order_id = req.body.orderNo;

        // If orderNo isn't in req.body, wait, the standard CCAvenue response only gives encResp.
        // We MUST decrypt to get order_id. So how do we know which key to use?
        // Let's try dev key first, if it fails, try prod key. Or vice versa.
        let decryptedResponse = '';
        let origin = '';

        try {
            // Try Production Key First
            decryptedResponse = decryptCCAvenueResponse(encResp, env.CCAVENUE_WORKING_KEY);
            const tryParse = parseResponse(decryptedResponse);
            if (!tryParse.order_id) throw new Error("Not prod key");
        } catch (e) {
            // Try Dev Key
            try {
                decryptedResponse = decryptCCAvenueResponse(encResp, env.CCAVENUE_WORKING_KEY_DEV);
            } catch (err2) {
                console.error("❌ Failed to decrypt with both keys");
                const fallbackUrl = env.CCAVENUE_FRONTEND_URL;
                return res.redirect(`${fallbackUrl}/payment/failure?reason=decryption_failed`);
            }
        }

        console.log("Decrypted Response String:");
        console.log(decryptedResponse);

        // Parse response
        const responseParams = parseResponse(decryptedResponse);

        console.log("Parsed Response Params:");
        console.log(JSON.stringify(responseParams, null, 2));

        const {
            order_status,
            amount,
            tracking_id,
            bank_ref_no,
            failure_message
        } = responseParams;
        order_id = responseParams.order_id; // Get confirmed order_id


        console.log("Order ID:", order_id);
        console.log("Order Status:", order_status);
        console.log("Amount:", amount);
        console.log("Tracking ID:", tracking_id);
        console.log("Bank Ref No:", bank_ref_no);

        // ✅ ATOMIC LOCK: Find and delete from DB to enforce processing exactly once
        let dbPendingData = null;
        if (encResp && order_id) {
            const result = await mongoose.connection.collection('payment_initiated')
                .findOneAndDelete({ orderId: order_id });
            dbPendingData = result?.value || result; // Handle both older and newer MongoDB driver structures
            console.log("Atomic DB Lock Acquired:", !!dbPendingData);
        }

        // ✅ LOCAL LOCK: Retrieve and IMMEDIATELY delete from local memory map
        const memoryPendingData = pendingPayments.get(order_id);
        pendingPayments.delete(order_id);

        const pendingData = memoryPendingData || dbPendingData;

        if (!pendingData) {
            console.error(`❌ Invalid, expired, or already-processed concurrent order: ${order_id}`);
            const fallbackUrl = env.CCAVENUE_FRONTEND_URL;
            return res.redirect(`${fallbackUrl}/payment/failure?reason=invalid_order`);
        }

        origin = pendingData.origin || '';
        const ccConfig = getCCAvenueConfig({ origin });

        console.log("Pending Payment Data Found");

        const { candidateDetails, isAddMore, candidateId, selected_courses } = pendingData;

        if (order_status === "Success") {
            if (isAddMore) {
                console.log("✅ Add More Courses SUCCESS for order:", order_id);
                try {
                    const result = await addMoreCandidateCoursesService(candidateId, selected_courses, {
                        amount_paid: parseFloat(amount),
                        transaction_id: tracking_id,
                        transaction_date: new Date().toISOString(),
                        payment_method: "ccavenue"
                    });

                    await createPaymentAuditLog({
                        personal_details: { candidateId },
                        selected_courses: selected_courses,
                        payment_details: {
                            payment_method: "ccavenue",
                            amount_paid: parseFloat(amount),
                            status: "Success",
                            transaction_id: tracking_id,
                            bank_ref_no: bank_ref_no,
                            transaction_date: new Date().toISOString(),
                            is_add_more: true
                        }
                    });

                    return res.redirect(
                        `${ccConfig.frontendUrl}/payment/success?transaction_id=${tracking_id}&status=success&type=add_more`
                    );
                } catch (error: any) {
                    console.error("❌ Add More Courses failed:", error.message);
                    return res.redirect(
                        `${ccConfig.frontendUrl}/payment/failure?status=error&message=${encodeURIComponent(error.message)}`
                    );
                }
            }

            console.log("✅ Payment SUCCESS for order:", order_id);

            const applicationInfo = candidateDetails.personal_details.application_info;

            const transformedBody = {
                personal_details: {
                    basic_info: candidateDetails.personal_details.basic_info,
                    contact_info: candidateDetails.personal_details.contact_info,
                    address: candidateDetails.personal_details.address,
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
                    ...candidateDetails.payment_details,
                    payment_method: "ccavenue",
                    amount_paid: parseFloat(amount),
                    status: "success",
                    transaction_id: tracking_id,
                    bank_ref_no: bank_ref_no,
                    transaction_date: new Date().toISOString(),
                    gateway_response: responseParams
                }
            };

            // await createPaymentAuditLog({
            //     personal_details: transformedBody.personal_details,
            //     selected_courses: transformedBody.selected_courses,
            //     payment_details: transformedBody.payment_details,
            //     step_completed: candidateDetails?.step_completed
            // });

            await createPaymentAuditLog({
                personal_details: candidateDetails || {},
                selected_courses: candidateDetails?.selected_courses || [],
                payment_details: {
                    ...(candidateDetails?.payment_details || {}),
                    payment_method: "ccavenue",
                    amount_paid: amount ? parseFloat(amount) : 0,
                    status: order_status,
                    transaction_id: tracking_id,
                    bank_ref_no: bank_ref_no || null,
                    transaction_date: new Date().toISOString(),
                    gateway_response: responseParams,
                    failure_message: failure_message || ""
                },
                step_completed: candidateDetails?.step_completed
            });

            console.log("Transformed Signup Payload:");
            console.log(JSON.stringify(transformedBody, null, 2));

            try {
                // ✅ ONLY CALL SERVICE (NOT CONTROLLER)
                const result = await createCandidateService(transformedBody, req);

                console.log("✅ Candidate Signup Completed");

                const candidate = await CandidateAdmission.findOne(
                    { "payment.transaction_id": tracking_id },
                    {
                        registration_number: 1,
                        "personal_details.phone": 1,
                        "payment.$": 1
                    }
                );

                if (!candidate) {
                    throw new Error("Transaction not found");
                }

                const registration_number = candidate.registration_number;
                const candidate_name = candidate.personal_details?.fullName || 'Candidate';
                const phone = candidate.personal_details?.phone;
                const email = candidate.personal_details?.email;

                // ✅ SEND SMS (NON-BLOCKING SAFE)
                if (phone) {
                    const message = `Dear ${candidate_name}, Your Registration No. is:${registration_number} and the Password is:${phone} - Bishop Heber College`;

                    await sendSMSService(phone, message); // 🔥 no await (optional)
                    // OR await if you want strict confirmation:
                    // await sendSMSService(phone, message);
                }
                // ✅ CLEANUP

                if (email) {
                    console.log("------ Mail ------ Init :", email);
                    await sendMailService(email, registration_number.toString(), phone!);
                }

                // ✅ REDIRECT (ONLY ONE RESPONSE)
                return res.redirect(
                    `${ccConfig.frontendUrl}/payment/success?transaction_id=${tracking_id}&status=success`
                );

            } catch (error: any) {
                console.error("❌ Signup failed:", error.message);

                return res.redirect(
                    `${ccConfig.frontendUrl}/payment/failure?status=error&message=${encodeURIComponent(error.message)}`
                );
            }
        } else {

            console.warn("❌ Payment FAILED");
            console.warn("Failure Message:", failure_message);

            await createPaymentAuditLog({
                personal_details: candidateDetails || {},
                selected_courses: candidateDetails?.selected_courses || [],
                payment_details: {
                    ...(candidateDetails?.payment_details || {}),
                    payment_method: "ccavenue",
                    amount_paid: amount ? parseFloat(amount) : 0,
                    status: order_status,
                    transaction_id: tracking_id || `FAILED_${Date.now()}`,
                    bank_ref_no: bank_ref_no || null,
                    transaction_date: new Date().toISOString(),
                    gateway_response: responseParams,
                    failure_message: failure_message || "Payment failed"
                },
                step_completed: candidateDetails?.step_completed
            });

            // return res.redirect(
            //     `${env.FRONTEND_URL}/payment/failure?reason=payment_failed&message=${encodeURIComponent(
            //         failure_message || "Payment failed"
            //     )}`
            // );
            const failureUrl = isAddMore
                ? `${ccConfig.frontendUrl}/payment/failure?transaction_id=${tracking_id}&status=failed&type=add_more`
                : `${ccConfig.frontendUrl}/payment/failure?transaction_id=${tracking_id}&status=failed`;

            return res.redirect(failureUrl);
        }

    } catch (err) {

        console.error("❌ CCAvenue Response Handling Error:", err);
        const fallbackUrl = env.CCAVENUE_FRONTEND_URL;
        return res.redirect(`${fallbackUrl}/payment/failure?reason=server_error`);
    }
};

export const handleDecryptionData = async (req: Request, res: Response): Promise<void> => {
    console.log("=========== CCAvenue Decrypt Received ===========");

    try {
        const { encResp } = req.body;

        // 🔴 Step 1: Validate Input
        if (!encResp) {
            console.error("❌ Missing encResp in request body");

            return res.redirect(
                `${env.CCAVENUE_FRONTEND_URL}/payment/failure?reason=no_response`
            );
        }

        console.log("📦 encResp received");

        let decryptedResponse: string | null = null;

        // 🟡 Step 2: Try PROD Key
        try {
            decryptedResponse = decryptCCAvenueResponse(
                encResp,
                env.CCAVENUE_WORKING_KEY_ADMAPI
            );

            const parsed = parseResponse(decryptedResponse);

            if (!parsed.order_id) {
                throw new Error("Invalid PROD key response");
            }

            console.log("✅ Decrypted using PROD key");

            res.status(200).json({
                success: true,
                data: parsed
            });
            return;

        } catch (prodError) {
            console.warn("⚠️ PROD decryption failed, trying DEV key...");

            // 🟡 Step 3: Try DEV Key
            try {
                decryptedResponse = decryptCCAvenueResponse(
                    encResp,
                    env.CCAVENUE_WORKING_KEY_ADMAPI
                );

                console.log("✅ Decrypted using DEV key");

            } catch (devError) {
                console.error("❌ Both PROD & DEV decryption failed");

                return res.redirect(
                    `${env.CCAVENUE_FRONTEND_URL}/payment/failure?reason=decryption_failed`
                );
            }
        }


    } catch (err) {
        console.error("❌ Unexpected Cancel Handler Error:", err);

        return res.redirect(
            `${env.CCAVENUE_FRONTEND_URL}/payment/failure?reason=server_error`
        );
    }
};

// Handle CCAvenue cancellation
export const handleCCAvenueCancel = async (req: Request, res: Response): Promise<void> => {
    try {

        console.log("=========== CCAvenue Cancel Received ===========");
        console.log("Request Body:", JSON.stringify(req.body, null, 2));

        const { encResp } = req.body;

        if (!encResp) {
            console.error("❌ No encResp found in cancel request");
            const fallbackUrl = env.CCAVENUE_FRONTEND_URL;
            return res.redirect(`${fallbackUrl}/payment/failure?reason=no_response`);
        }
        console.log("encResp type:", typeof encResp);

        let decryptedResponse = '';
        let order_id = '';

        try {
            decryptedResponse = decryptCCAvenueResponse(encResp, env.CCAVENUE_WORKING_KEY);
            const tryParse = parseResponse(decryptedResponse);
            if (!tryParse.order_id) throw new Error("Not prod key");
        } catch (e) {
            try {
                decryptedResponse = decryptCCAvenueResponse(encResp, env.CCAVENUE_WORKING_KEY_DEV);
            } catch (err2) {
                console.error("❌ Failed to decrypt cancel response");
                const fallbackUrl = env.CCAVENUE_FRONTEND_URL;
                return res.redirect(`${fallbackUrl}/payment/failure?reason=decryption_failed`);
            }
        }

        console.log("Decrypted Response:");
        console.log(decryptedResponse);

        // ✅ Parse
        const responseParams = parseResponse(decryptedResponse);

        console.log("Parsed Response Params:");
        console.log(JSON.stringify(responseParams, null, 2));

        const {
            order_status,
            tracking_id,
            bank_ref_no,
            failure_message,
            amount
        } = responseParams;
        order_id = responseParams.order_id;

        console.log("Order ID:", order_id);
        console.log("Order Status:", order_status);

        // ✅ ATOMIC LOCK: Find and delete from DB
        let dbPendingData = null;
        if (encResp && order_id) {
            const result = await mongoose.connection.collection('payment_initiated')
                .findOneAndDelete({ orderId: order_id });
            dbPendingData = result?.value || result;
            console.log("Atomic DB Lock Acquired:", !!dbPendingData);
        }

        // ✅ LOCAL LOCK: Retrieve and IMMEDIATELY delete from local memory map
        const memoryPendingData = pendingPayments.get(order_id);
        pendingPayments.delete(order_id);

        const pendingData = memoryPendingData || dbPendingData;

        if (!pendingData) {
            console.warn("⚠️ No pending payment found for:", order_id);
        }

        const origin = pendingData?.origin || '';
        const ccConfig = getCCAvenueConfig({ origin });
        const candidateDetails = pendingData?.candidateDetails;

        // ✅ SAVE AUDIT LOG (IMPORTANT)
        await createPaymentAuditLog({
            personal_details: candidateDetails || {},
            selected_courses: candidateDetails?.selected_courses || [],
            payment_details: {
                ...(candidateDetails?.payment_details || {}),
                payment_method: "ccavenue",
                amount_paid: amount ? parseFloat(amount) : 0,
                status: order_status,
                transaction_id: tracking_id || `CANCEL_${Date.now()}`,
                bank_ref_no: bank_ref_no || null,
                transaction_date: new Date().toISOString(),
                gateway_response: responseParams,
                failure_message: failure_message || "User cancelled payment"
            },
            step_completed: candidateDetails?.step_completed
        });

        console.log("✅ Cancel payment audit log saved");

        // ✅ CLEANUP
        console.log("Redirecting to Cancel Page");

        const isAddingMore = pendingData?.isAddMore;
        const cancelUrl = isAddingMore
            ? `${ccConfig.frontendUrl}/payment/failure?reason=cancelled&transaction_id=${tracking_id}&type=add_more`
            : `${ccConfig.frontendUrl}/payment/failure?reason=cancelled&transaction_id=${tracking_id}`;

        return res.redirect(cancelUrl);

    } catch (err) {

        console.error("❌ Cancel Handler Error:", err);
        const fallbackUrl = env.CCAVENUE_FRONTEND_URL;
        return res.redirect(`${fallbackUrl}/payment/failure?reason=cancel_error`);
    }
};
// Payment status endpoint
export const getPaymentStatus = async (req: Request, res: Response): Promise<Response> => {
    try {

        console.log("=========== Payment Status Check ===========");

        const { transaction_id } = req.params;

        if (!transaction_id) {
            return res.status(400).json({
                status: "error",
                message: "Transaction ID required"
            });
        }

        console.log("Searching for transaction:", transaction_id);

        // 🔍 Get FULL candidate document (no projection)
        const candidate = await CandidateAdmission.findOne({
            "payment.transaction_id": transaction_id
        });

        if (!candidate) {
            return res.status(404).json({
                status: "not_found",
                transaction_id,
                message: "Transaction not found"
            });
        }

        // 🎯 Extract exact payment
        const payment = candidate.payment.find(
            (p: any) => p.transaction_id === transaction_id
        );

        if (!payment) {
            return res.status(404).json({
                status: "not_found",
                transaction_id,
                message: "Payment record not found"
            });
        }

        console.log("✅ Payment found");

        return res.status(200).json({
            status: payment.status,
            transaction_id: payment.transaction_id,

            payment,          // ✅ full payment object
            candidate         // ✅ full candidate document
        });

    } catch (err) {
        console.error("❌ Payment Status Error:", err);

        return res.status(500).json({
            status: "error",
            message: "Server error"
        });
    }
};

//////////////////////////////////////////////////////////////TESTING

export const testing_failurStatusResponse = async (
    req: Request<{ reason: string }, {}, {}, { message?: string }>,
    res: Response
): Promise<Response> => {

    const { reason } = req.params;
    const { message } = req.query;

    console.log("🔴 Payment Failure Route Hit");
    console.log("Reason:", reason);
    console.log("Message:", message);

    return res.status(400).send(`
        <html>
            <head>
                <title>Payment Failed</title>
            </head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1 style="color: red;">❌ Payment Failed</h1>
                <p><strong>Reason:</strong> ${reason || "Unknown"}</p>
                <p><strong>Message:</strong> ${message || "No message provided"}</p>
            </body>
        </html>
    `);
};

export const CheckFailureStatusResponse = async (
    req: Request<{ transaction_id: string }, {}, {}, { status?: string }>,
    res: Response
): Promise<Response> => {

    try {
        const { transaction_id } = req.params;
        const { status } = req.query;

        console.log("🟢 Payment Success Route Hit");
        console.log("Transaction ID:", transaction_id);
        console.log("Status:", status);

        if (!transaction_id) {
            return res.status(400).json({
                message: "Transaction ID is required"
            });
        }

        // ✅ FETCH FROM DB
        const paymentData = await payment_log.findOne({
            "payment_details.transaction_id": transaction_id
        }).lean();

        if (!paymentData) {
            return res.status(404).json({
                message: "Payment record not found"
            });
        }

        // ✅ RETURN FULL DATA (JSON)
        return res.status(200).json({
            message: "Payment fetched successfully",
            data: paymentData
        });

    } catch (error: any) {
        console.error("❌ Error fetching payment:", error);

        return res.status(500).json({
            message: "Internal server error",
            error: error.message
        });
    }
};



export const CheckSuccessStatusResponse = async (
    req: Request<{ transaction_id: string }, {}, {}, { status?: string }>,
    res: Response
): Promise<Response> => {

    try {
        const { transaction_id } = req.params;
        const { status } = req.query;

        console.log("🟢 Payment Success Route Hit");
        console.log("Transaction ID:", transaction_id);
        console.log("Status:", status);

        if (!transaction_id) {
            return res.status(400).json({
                message: "Transaction ID is required"
            });
        }

        // ✅ FETCH FROM DB (CandidateAdmission model)
        const candidateData: any = await CandidateAdmission.findOne({
            "payment.transaction_id": transaction_id
        }).lean();

        if (!candidateData) {
            return res.status(404).json({
                message: "Candidate payment record not found"
            });
        }

        // 🎯 Extract exact payment
        const paymentData = candidateData.payment?.find(
            (p: any) => p.transaction_id === transaction_id
        );

        if (!paymentData) {
            return res.status(404).json({
                message: "Specific payment record not found"
            });
        }

        // ✅ CHECK STATUS (from query)
        if (status && paymentData.status !== status) {
            return res.status(400).json({
                message: "Payment status mismatch",
                expected: status,
                actual: paymentData.status
            });
        }

        // ✅ Filter applications to ONLY show those for this transaction
        const filteredApplications = (candidateData.application_preferences?.applications || [])
            .filter((app: any) => app.transaction_id === transaction_id);

        if (filteredApplications.length > 0) {
            candidateData.application_preferences.applications = filteredApplications;
        }

        // ✅ RETURN FULL DATA (JSON)
        return res.status(200).json({
            message: "Payment fetched successfully",
            data: {
                payment: paymentData,
                candidate: candidateData
            }
        });

    } catch (error: any) {
        console.error("❌ Error fetching payment:", error);

        return res.status(500).json({
            message: "Internal server error",
            error: error.message
        });
    }
};




// Get all payments (Audit Logs with Pagination)
export const getAllPayments = async (req: Request, res: Response): Promise<Response> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const total = await payment_log.countDocuments();
        let payments = await payment_log.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Enrich payments with Candidate details to replace anonymous/na
        const candidateIds = payments
            .map((p: any) => p.personal_details?.candidateId)
            .filter((id: any) => id && typeof id === 'string' && id.length === 24);

        if (candidateIds.length > 0) {
            const candidates = await CandidateAdmission.find(
                { _id: { $in: candidateIds } },
                { 'personal_details.fullName': 1, 'personal_details.email': 1, 'personal_details.phone': 1 }
            ).lean();

            const candidateMap = new Map();
            candidates.forEach((c: any) => candidateMap.set(c._id.toString(), c));

            payments = payments.map((payment: any) => {
                const cId = payment.personal_details?.candidateId;
                if (cId && candidateMap.has(cId.toString())) {
                    const cData = candidateMap.get(cId.toString());

                    if (!payment.personal_details) payment.personal_details = {};
                    if (!payment.personal_details.basic_info) payment.personal_details.basic_info = {};
                    if (!payment.personal_details.contact_info) payment.personal_details.contact_info = {};

                    payment.personal_details.basic_info.name = cData.personal_details?.fullName || "anonymous";
                    payment.personal_details.contact_info.email = cData.personal_details?.email || "n/a";
                    payment.personal_details.contact_info.mobile = cData.personal_details?.phone || "n/a";
                }
                return payment;
            });
        }

        return res.status(200).json({
            success: true,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            data: payments
        });
    } catch (error: any) {
        console.error("❌ Error fetching all payments:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};


// Get all payments initiated (Audit Logs with Pagination)
export const getMissedPaymentsFull = async (req: Request, res: Response) => {
    try {
        const paymentCollection = mongoose.connection.collection("payment_initiated");

        const payments = await paymentCollection
            .find({})
            .sort({ timestamp: -1 })
            .toArray();

        const Transaction = mongoose.model('Transaction');

        // Extract all mobiles and orderIds
        const mobiles = payments.map((p: any) =>
            p?.candidateDetails?.personal_details?.contact_info?.mobile
        ).filter(Boolean);

        const orderIds = payments.map((p: any) => p.orderId).filter(Boolean);

        // Fetch all matching candidates
        const candidates = await CandidateAdmission.find({
            'personal_details.phone': { $in: mobiles }
        }).lean();

        // Fetch matching Shipped transactions (to flag them in the UI)
        const transactions = await Transaction.find({
            orderNo: { $in: orderIds } // We fetch all matching from Excel to show actual status
        }).lean() as any[];

        // Create lookup map (O(1) access)
        const candidateMap = new Map();
        candidates.forEach((c: any) => {
            candidateMap.set(c.personal_details.phone, c);
        });

        const transactionMap = new Map();
        transactions.forEach((t: any) => {
            if (!transactionMap.has(t.orderNo)) {
                transactionMap.set(t.orderNo, []);
            }
            transactionMap.get(t.orderNo).push(t);
        });

        // Group enriched data by candidate (phone) for deduplication
        const candidateGroups = new Map<string, any>();

        for (const p of payments) {
            const phone = p?.candidateDetails?.personal_details?.contact_info?.mobile;
            if (!phone) continue;

            const candidate = candidateMap.get(phone);
            const matchedTransactions = transactionMap.get(p.orderId) || [];
            let transaction = null;

            if (matchedTransactions.length > 0) {
                // Priority logic for multiple transaction records for ONE orderId
                transaction = matchedTransactions.find((t: any) => t.orderStatus === 'Shipped' && t.billTel === phone);
                if (!transaction) transaction = matchedTransactions.find((t: any) => t.orderStatus === 'Shipped');
                if (!transaction) transaction = matchedTransactions.find((t: any) => t.billTel === phone);
                if (!transaction) transaction = matchedTransactions[0];
            }

            const is_shipped = transaction ? (transaction.orderStatus === 'Shipped') : false;

            const enrichedItem: any = {
                ...p,
                already_registered: !!candidate,
                candidate_id: candidate?._id || null,
                candidate_reg_number: candidate?.registration_number || null,
                amount: transaction ? transaction.orderAmount : p.amount,
                transaction_id: transaction ? transaction.orderNo : p.orderId,
                payment_date: transaction ? transaction.orderDatetime : p.timestamp,
                timestamp: p.timestamp, // Keep for sorting/deduplication
                bank_ref_no: transaction ? transaction.orderBankRefNo : 'N/A',
                is_shipped_in_excel: is_shipped,
                actual_transaction_status: transaction ? transaction.orderStatus : 'Not Found in Excel'
            };

            // DEDUPLICATION: Group by phone number
            const existingInGroup = candidateGroups.get(phone);
            if (!existingInGroup) {
                candidateGroups.set(phone, enrichedItem);
            } else {
                // Priority logic: Replace current item with THIS item IF:
                // 1. Current NOT shipped, but THIS one is
                // 2. Both NOT shipped, but THIS one is newer
                const existingShipped = existingInGroup.is_shipped_in_excel;
                if (!existingShipped && is_shipped) {
                    candidateGroups.set(phone, enrichedItem);
                } else if (!existingShipped && !is_shipped) {
                    // Both unsuccessful, keep the latest one
                    if (new Date(enrichedItem.timestamp) > new Date(existingInGroup.timestamp)) {
                        candidateGroups.set(phone, enrichedItem);
                    }
                }
            }
        }

        const enrichedData = Array.from(candidateGroups.values());

        return res.status(200).json({
            success: true,
            total: enrichedData.length,
            data: enrichedData
        });

    } catch (error: any) {
        console.error("❌ Error fetching missed payments:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};


// Helper function to generate CCAvenue encrypted request
function generateCCAvenueEncRequest(params: any): string {

    const workingKey = env.CCAVENUE_WORKING_KEY;

    if (!workingKey) {
        console.error("❌ CCAVENUE_WORKING_KEY is missing in environment variables");
        throw new Error("CCAvenue working key not configured");
    }

    const data = `merchant_id=${params.merchant_id}&order_id=${params.order_id}&amount=${params.amount}&currency=${params.currency}&redirect_url=${params.redirect_url}&cancel_url=${params.cancel_url}&language=${params.language}&customer_id=${params.customer_id}&customer_name=${encodeURIComponent(params.customer_name)}&customer_email=${params.customer_email}&customer_mobile=${params.customer_mobile}&billing_address=${encodeURIComponent(params.billing_address)}&billing_name=${params.billing_name}&billing_zip=${params.billing_zip}&billing_email=${params.billing_email}&billing_tel=${params.billing_tel}&billing_city=${params.billing_city}&billing_state=${params.billing_state}&billing_country=${params.billing_country}`;

    console.log("CCAvenue Request String:");
    console.log(data);

    const md5 = crypto.createHash('md5').update(workingKey).digest();

    const iv = Buffer.from([
        0x00, 0x01, 0x02, 0x03,
        0x04, 0x05, 0x06, 0x07,
        0x08, 0x09, 0x0a, 0x0b,
        0x0c, 0x0d, 0x0e, 0x0f
    ]);

    const cipher = crypto.createCipheriv('aes-128-cbc', md5, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return encrypted;
}

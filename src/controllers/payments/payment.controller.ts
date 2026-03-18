
import { Request, Response } from 'express';
import crypto from 'crypto';
import { candidateSignup, SignupRequest } from '../auth/auth.controller';
import { env } from '../../config/env';
import { createCandidateService } from '../../services/candidate.service';
import payment_log from '../../models/audit/payment_log';
import { createPaymentAuditLog } from '../../services/auditlog.service';

// Helper to decrypt CCAvenue response
function decryptCCAvenueResponse(encResp: string): string {
    const workingKey = env.CCAVENUE_WORKING_KEY;
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
const freeCommunities = ['SC', 'ST', 'SAC'];

// Direct save for exempted candidates (NRI, Reserved, Zero Fee)
export const directSaveApplication = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { candidateDetails, amount, isExempted, exemptionReason } = req.body;

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
                transaction_id: `EXEMPTED${Date.now()}${Math.floor(Math.random() * 1000)}`,
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
        const orderId = `BHC-ADM-${Date.now()}${Math.floor(Math.random() * 10000)}`;
        console.log("Generated Order ID:", orderId);

        // Store pending payment data
        pendingPayments.set(orderId, {
            candidateDetails,
            amount,
            timestamp: new Date().toISOString()
        });

        console.log("Pending payment stored in memory for order:", orderId);

        // Set expiration after 1 hour
        setTimeout(() => {
            console.log("⏳ Payment expired. Removing order:", orderId);
            pendingPayments.delete(orderId);
        }, 60 * 60 * 1000);

        console.log("Generating CCAvenue encrypted request...");

        // Generate CCAvenue encrypted request
        const encRequest = generateCCAvenueEncRequest({
            order_id: orderId,
            amount: amount,
            currency: 'INR',
            redirect_url: `${env.BASE_URL}/api/secure/payment/ccavenue/response`,
            cancel_url: `${env.BASE_URL}/api/secure/payment/ccavenue/cancel`,
            language: 'EN',
            merchant_id: env.CCAVENUE_MERCHANT_ID,
            customer_id: candidateDetails.personal_details.contact_info.email,
            customer_name: candidateDetails.personal_details.basic_info.name,
            customer_email: candidateDetails.personal_details.contact_info.email,
            customer_mobile: candidateDetails.personal_details.contact_info.mobile,
            billing_address: candidateDetails.personal_details.address.present_address || 'NA',
            billing_name: candidateDetails.personal_details.basic_info.name,
            billing_zip: candidateDetails.address.pincode,
            billing_email: candidateDetails.personal_details.contact_info.email,
            billing_tel: candidateDetails.personal_details.contact_info.mobile
        });

        console.log("Encrypted Request Generated Successfully");

        const responsePayload = {
            accessCode: env.CCAVENUE_ACCESS_CODE,
            encRequest: encRequest,
            ccavenueUrl: env.CCAVENUE_PAYMENT_URL
        };

        console.log("Returning Payment Initiation Response:");
        console.log(JSON.stringify(responsePayload, null, 2));

        console.log(`✅ Payment initiated successfully: OrderID=${orderId}, Amount=${amount}`);
        console.log("=== CCAvenue Payment Initiation Completed ===");

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
// Handle CCAvenue payment response (success)
export const handleCCAvenueResponse = async (req: Request, res: Response): Promise<void> => {
    try {

        console.log("=========== CCAvenue Response Received ===========");
        console.log("Raw Body:", JSON.stringify(req.body, null, 2));

        const { encResp } = req.body;

        if (!encResp) {
            console.error("❌ No encryption response received from CCAvenue");

            return res.redirect(`${env.FRONTEND_URL}/payment/failure?reason=no_response`);
        }

        console.log("Encrypted Response Length:", encResp.length);

        // Decrypt response
        const decryptedResponse = decryptCCAvenueResponse(encResp);

        console.log("Decrypted Response String:");
        console.log(decryptedResponse);

        // Parse response
        const responseParams = parseResponse(decryptedResponse);

        console.log("Parsed Response Params:");
        console.log(JSON.stringify(responseParams, null, 2));

        const {
            order_id,
            order_status,
            amount,
            tracking_id,
            bank_ref_no,
            failure_message
        } = responseParams;

        console.log("Order ID:", order_id);
        console.log("Order Status:", order_status);
        console.log("Amount:", amount);
        console.log("Tracking ID:", tracking_id);
        console.log("Bank Ref No:", bank_ref_no);

        // Retrieve pending payment
        const pendingData = pendingPayments.get(order_id);

        if (!pendingData) {
            console.error(`❌ Invalid order or expired order: ${order_id}`);

            return res.redirect(`${env.FRONTEND_URL}/payment/failure?reason=invalid_order`);
        }

        console.log("Pending Payment Data Found");

        const { candidateDetails } = pendingData;

        if (order_status === "Success") {

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

            await createPaymentAuditLog({
                personal_details: transformedBody.personal_details,
                selected_courses: transformedBody.selected_courses,
                payment_details: transformedBody.payment_details
            });

            console.log("Transformed Signup Payload:");
            console.log(JSON.stringify(transformedBody, null, 2));

            try {
                // ✅ ONLY CALL SERVICE (NOT CONTROLLER)
                const result = await createCandidateService(transformedBody, req);

                console.log("✅ Candidate Signup Completed");

                // ✅ CLEANUP
                pendingPayments.delete(order_id);
                console.log("Pending Payment Removed:", order_id);

                // ✅ REDIRECT (ONLY ONE RESPONSE)
                return res.redirect(
                    `${env.FRONTEND_URL}/payment/success?transaction_id=${tracking_id}&status=success`
                );

            } catch (error: any) {
                console.error("❌ Signup failed:", error.message);

                return res.redirect(
                    `${env.FRONTEND_URL}/payment/failure?status=error&message=${encodeURIComponent(error.message)}`
                );
            }
        } else {

            console.warn("❌ Payment FAILED");
            console.warn("Failure Message:", failure_message);

            pendingPayments.delete(order_id);

            return res.redirect(
                `${env.FRONTEND_URL}/payment/failure?reason=payment_failed&message=${encodeURIComponent(
                    failure_message || "Payment failed"
                )}`
            );
        }

    } catch (err) {

        console.error("❌ CCAvenue Response Handling Error:", err);

        return res.redirect(
            `${env.FRONTEND_URL}/payment/failure?reason=server_error`
        );
    }
};

// Handle CCAvenue cancellation
export const handleCCAvenueCancel = async (req: Request, res: Response): Promise<void> => {
    try {

        console.log("=========== CCAvenue Cancel Received ===========");
        console.log("Request Body:", JSON.stringify(req.body, null, 2));

        // ✅ FIX: Extract encResp properly
        const { encResp } = req.body;

        if (!encResp) {
            console.error("❌ No encResp found in cancel request");

            return res.redirect(`${env.FRONTEND_URL}/payment/failure?reason=no_response`);
        }

        console.log("encResp type:", typeof encResp);

        // ✅ Decrypt
        const decryptedResponse = decryptCCAvenueResponse(encResp);

        console.log("Decrypted Response:");
        console.log(decryptedResponse);

        // ✅ Parse
        const responseParams = parseResponse(decryptedResponse);

        console.log("Parsed Response Params:");
        console.log(JSON.stringify(responseParams, null, 2));

        const {
            order_id,
            order_status,
            tracking_id,
            bank_ref_no,
            failure_message,
            amount
        } = responseParams;

        console.log("Order ID:", order_id);
        console.log("Order Status:", order_status);

        // ✅ Get pending data
        const pendingData = pendingPayments.get(order_id);

        if (!pendingData) {
            console.warn("⚠️ No pending payment found for:", order_id);
        }

        const candidateDetails = pendingData?.candidateDetails;

        // ✅ SAVE AUDIT LOG (IMPORTANT)
        await createPaymentAuditLog({
            personal_details: candidateDetails?.personal_details || {},
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
            }
        });

        console.log("✅ Cancel payment audit log saved");

        // ✅ CLEANUP
        if (order_id) {
            pendingPayments.delete(order_id);
            console.log("Pending Payment Removed:", order_id);
        }

        console.log("Redirecting to Cancel Page");

        return res.redirect(
            `${env.FRONTEND_URL}/payment/failure?reason=cancelled&transaction_id=${tracking_id}`
        );

    } catch (err) {

        console.error("❌ Cancel Handler Error:", err);

        return res.redirect(
            `${env.FRONTEND_URL}/payment/failure?reason=cancel_error`
        );
    }
};
// Payment status endpoint
export const getPaymentStatus = async (req: Request, res: Response): Promise<Response> => {
    try {

        console.log("=========== Payment Status Check ===========");

        const { transaction_id } = req.params;

        console.log("Transaction ID:", transaction_id);

        if (!transaction_id) {

            console.warn("Transaction ID missing");

            return res.status(400).json({
                status: "error",
                message: "Transaction ID required"
            });
        }

        console.log("Checking database for transaction...");

        return res.status(200).json({
            status: "pending",
            transaction_id,
            message: "Payment status endpoint - implement with database"
        });

    } catch (err) {

        console.error("❌ Payment Status Error:", err);

        return res.status(500).json({
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

export const ChecksuccessStatusResponse = async (
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






// Helper function to generate CCAvenue encrypted request
function generateCCAvenueEncRequest(params: any): string {

    const workingKey = env.CCAVENUE_WORKING_KEY;

    if (!workingKey) {
        console.error("❌ CCAVENUE_WORKING_KEY is missing in environment variables");
        throw new Error("CCAvenue working key not configured");
    }

    const data = `merchant_id=${params.merchant_id}&order_id=${params.order_id}&amount=${params.amount}&currency=${params.currency}&redirect_url=${params.redirect_url}&cancel_url=${params.cancel_url}&language=${params.language}&customer_id=${params.customer_id}&customer_name=${encodeURIComponent(params.customer_name)}&customer_email=${params.customer_email}&customer_mobile=${params.customer_mobile}&billing_address=${encodeURIComponent(params.billing_address)}&billing_name=${params.billing_name}&billing_zip=${params.billing_zip}&billing_email=${params.billing_email}&billing_tel=${params.billing_tel}`;

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

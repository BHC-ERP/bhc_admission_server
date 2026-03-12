
import { Request, Response } from 'express';
import crypto from 'crypto';
import { candidateSignup, SignupRequest } from '../auth/auth.controller';
import { env } from '../../config/env';

// Store for pending payments (use Redis in production)
const pendingPayments = new Map();

// Free communities list (should match frontend)
const freeCommunities = ['SC', 'ST', 'OBC', 'EWS'];

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
        const { amount, candidateDetails } = req.body;

        // Double-check exemption cases (security)
        const isReservedCandidate = freeCommunities.includes(candidateDetails.personal_details.basic_info.community);
        const isNRI = candidateDetails.personal_details.basic_info.is_nri === true;

        // If exempted, should not reach here, but just in case
        if (amount === 0 || isReservedCandidate || isNRI) {
            return res.status(400).json({
                message: "Payment not required for this candidate"
            });
        }

        // Generate unique order ID
        const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 10000)}`;

        // Store pending payment data
        pendingPayments.set(orderId, {
            candidateDetails,
            amount,
            timestamp: new Date().toISOString()
        });

        // Set expiration after 1 hour
        setTimeout(() => {
            pendingPayments.delete(orderId);
        }, 60 * 60 * 1000);

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
            customer_name: candidateDetails.personal_details.basic_info.applicant_name,
            customer_email: candidateDetails.personal_details.contact_info.email,
            customer_mobile: candidateDetails.personal_details.contact_info.mobile,
            billing_address: candidateDetails.personal_details.contact_info.address || 'NA'
        });

        console.log(`Payment initiated: OrderID=${orderId}, Amount=${amount}`);

        return res.status(200).json({
            accessCode: env.CCAVENUE_ACCESS_CODE,
            encRequest: encRequest,
            ccavenueUrl: env.CCAVENUE_PAYMENT_URL
        });

    } catch (err) {
        console.error("CCAvenue payment initiation error:", err);
        return res.status(500).json({
            message: "Server error during payment initiation"
        });
    }
};

// Handle CCAvenue payment response (success)
export const handleCCAvenueResponse = async (req: Request, res: Response): Promise<void> => {
    try {
        const { encResp } = req.body;

        if (!encResp) {
            console.error("No encryption response received from CCAvenue");
            return res.redirect(`${env.FRONTEND_URL}/payment/failure?reason=no_response`);
        }

        // Decrypt the response from CCAvenue
        const decryptedResponse = decryptCCAvenueResponse(encResp);

        // Parse the response
        const responseParams = parseResponse(decryptedResponse);
        console.log("CCAvenue response parameters:", responseParams);

        const { order_id, order_status, amount, tracking_id, bank_ref_no, failure_message } = responseParams;

        // Retrieve pending payment data
        const pendingData = pendingPayments.get(order_id);

        if (!pendingData) {
            console.error(`Invalid order or order expired: ${order_id}`);
            return res.redirect(`${env.FRONTEND_URL}/payment/failure?reason=invalid_order`);
        }

        const { candidateDetails } = pendingData;

        if (order_status === 'Success') {
            // Payment successful - save to database
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
                    amount_paid: parseFloat(amount),
                    status: "success",
                    transaction_id: tracking_id,
                    bank_ref_no: bank_ref_no,
                    transaction_date: new Date().toISOString(),
                    gateway_response: responseParams
                }
            };

            // Create a new request object for signup
            const signupReq = {
                ...req,
                body: transformedBody
            } as Request<{}, {}, SignupRequest>;

            // Call signup function
            await candidateSignup(signupReq, {} as Response);

            // Clean up pending data
            pendingPayments.delete(order_id);

            // Redirect to success page
            return res.redirect(`${env.FRONTEND_URL}/payment/success?transaction_id=${tracking_id}&status=success`);

        } else {
            // Payment failed
            console.warn(`Payment failed for order ${order_id}: ${failure_message}`);
            pendingPayments.delete(order_id);
            return res.redirect(`${env.FRONTEND_URL}/payment/failure?reason=payment_failed&message=${encodeURIComponent(failure_message || 'Payment failed')}`);
        }

    } catch (err) {
        console.error("CCAvenue response handling error:", err);
        return res.redirect(`${env.FRONTEND_URL}/payment/failure?reason=server_error`);
    }
};

// Handle CCAvenue cancellation
export const handleCCAvenueCancel = async (req: Request, res: Response): Promise<void> => {
    try {
        const { order_id } = req.body;
        console.log(`Payment cancelled for order: ${order_id}`);

        if (order_id) {
            pendingPayments.delete(order_id);
        }

        return res.redirect(`${env.FRONTEND_URL}/payment/failure?reason=cancelled`);
    } catch (err) {
        console.error("CCAvenue cancel handling error:", err);
        return res.redirect(`${env.FRONTEND_URL}/payment/failure?reason=cancel_error`);
    }
};

// Payment status endpoint
export const getPaymentStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { transaction_id } = req.params;

        // Query your database for the payment status
        // This depends on your database model
        // const payment = await PaymentModel.findOne({ transaction_id });

        // Placeholder response
        return res.status(200).json({
            status: 'pending',
            message: 'Payment status endpoint - implement with your database'
        });

    } catch (err) {
        console.error("Payment status check error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

// Helper function to generate CCAvenue encrypted request
function generateCCAvenueEncRequest(params: any): string {
    const data = `merchant_id=${params.merchant_id}&order_id=${params.order_id}&amount=${params.amount}&currency=${params.currency}&redirect_url=${params.redirect_url}&cancel_url=${params.cancel_url}&language=${params.language}&customer_id=${params.customer_id}&customer_name=${encodeURIComponent(params.customer_name)}&customer_email=${params.customer_email}&customer_mobile=${params.customer_mobile}&billing_address=${encodeURIComponent(params.billing_address)}`;

    const workingKey = env.CCAVENUE_WORKING_KEY;
    const md5 = crypto.createHash('md5').update(workingKey).digest();
    const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    
    const cipher = crypto.createCipheriv('aes-128-cbc', md5, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return encrypted;
}

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
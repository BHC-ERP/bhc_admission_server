import { Request, Response } from "express";
import StaffModel from "../../models/staffmaster.heber.model";
import { sendOtpMail } from "../../utils/send_otp";
import { signToken } from "../../utils/jwt";
import programsModel from "../../models/programs.model";
import CandidateAdmission from "../../models/candidate.model";
import { createCandidateWithRetry, getNextRegistrationNumber } from "../../utils/getNextRegistrationNumber";
import { ApplicationCounter, getNextApplicationNumbers } from "../../models/auth/ApplicationCounter.model";
import { createCandidateService } from "../../services/candidate.service";


// Types and Interfaces
export interface SessionUser {
    id: string;
    registration_number: number;
    role: string;
    payment_status?: string;
    userData?: any;
}

// Extend Express Session
declare module "express-session" {
    interface SessionData {
        user?: SessionUser;
    }
}

interface BasicInfo {
    name: string;
    gender: string;
    date_of_birth: string;
    community: string;
    community_number?: string;
    other_community?: string;
    is_nri?: boolean;
}

interface ContactInfo {
    mobile: string;
    email: string;
}

interface ApplicationInfo {
    application_count: number;
    application_type: "UG" | "PG" | "Diploma" | "Certificate" | "PhD";
    program_code: string[];
    program_names: string[];
    program_streams: string[];
}

interface PersonalDetails {
    basic_info: BasicInfo;
    contact_info: ContactInfo;
    application_info: ApplicationInfo;
}

export interface SignupRequest {
    personal_details: PersonalDetails;
    selected_courses?: Array<{
        course: {
            id: string;
            code: string;
            name: string;
            type: string;
            stream: string;
            program_type: string;
            application_fee: number;
            count: number;
        };
        scholarship_applied: boolean;
    }>;
    payment_details?: any;
}

interface Program {
    program_code: string;
    program_name: string;
    _id: string;
}

interface Application {
    application_number: number;
    application_type: "UG" | "PG" | "Diploma" | "Certificate" | "PhD";
    program_code: string;
    program_name: string;
    stream?: "Aided" | "Self-Finance";
    status?: "Draft" | "Applied" | "Under Review" | "Selected" | "Not Selected" | "Waitlisted" | "Cancelled";
    shift?: "Shift-I" | "Shift-II";
    preference_order?: number;
}

interface Staff {
    _id: any;
    staff_id: string;
    name: string;
    department_code: string;
    department_name: string;
    shift: string;
    stream: string;
    college_email: string;
}

interface LoginRequest {
    registration_number: number;
    mobile: number;
}

interface DepartmentLoginRequest {
    college_email: string;
}

interface VerifyOTPRequest {
    college_email: string;
    otp: string;
}

interface MongoError extends Error {
    code?: number;
    keyPattern?: Record<string, any>;
    keyValue?: Record<string, any>;
}

interface ValidationError extends Error {
    name: "ValidationError";
    errors: Record<string, { message: string }>;
}

const freeCommunities = ["SC", "ST", "SCA"];





// Candidate Signup
export const candidateSignup = async (req: Request, res: Response) => {
    try {
        const result = await createCandidateService(req.body, req);
        return res.status(201).json(result);

    } catch (err: any) {
        return res.status(400).json({
            message: err.message || "Something went wrong"
        });
    }
};


//find registration number using mobile number
export const findRegistrationNumber = async (
    req: Request<{}, {}, { mobile: string }>,
    res: Response
): Promise<Response> => {
    try {
        const { mobile } = req.body;
        if (!mobile) {
            return res.status(400).json({
                message: "Mobile number is required"
            });
        }
        const candidate = await CandidateAdmission.findOne({
            "personal_details.phone": mobile
        }).lean();
        if (!candidate) {
            return res.status(404).json({
                message: "No registration found for this mobile number"
            });
        }
        return res.json({
            message: "Registration number found",
            registration_number: candidate.registration_number
        });
    } catch (err) {
        console.error("Find registration number error:", err);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
};


// Candidate Login
export const candidateLogin = async (
    req: Request<{}, {}, LoginRequest>,
    res: Response
): Promise<Response> => {
    try {
        const { registration_number, mobile } = req.body;

        if (!registration_number || !mobile) {
            return res.status(400).json({
                message: "Registration number and mobile are required"
            });
        }

        const candidate = await CandidateAdmission.findOne({
            registration_number
        }).lean();

        if (!candidate) {
            return res.status(401).json({
                message: "Invalid Registration Number"
            });
        }

        const candidateMobile = candidate.personal_details?.phone!;
        if (candidateMobile !== mobile.toString()) {
            return res.status(401).json({
                message: "Invalid Mobile Number"
            });
        }
        const latestPayment = candidate.payment?.[candidate.payment.length - 1];
        const user = {
            id: candidate._id.toString(),
            registration_number: candidate.registration_number,
            role: "candidate",
            payment_status: latestPayment?.status,
        };

        const token = signToken(user);

        if (req.session) {
            req.session.user = {
                id: candidate._id.toString(),
                registration_number: candidate.registration_number,
                role: "candidate",
                payment_status: latestPayment?.status,
            };
        }

        return res.json({
            message: "Login successful",
            token,
            user,
            session_id: req.sessionID
        });

    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
};

// Department Login
export const departmentLogin = async (
    req: Request<{}, {}, DepartmentLoginRequest>,
    res: Response
): Promise<Response> => {
    try {
        const { college_email } = req.body;

        if (!college_email) {
            return res.status(400).json({ message: "College email is required" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(college_email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        const staff = await StaffModel.findOne({ college_email });

        if (!staff) {
            return res.status(404).json({ message: "Email not registered" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        await StaffModel.updateOne(
            { college_email },
            {
                $set: {
                    otp,
                    otp_expires_at: new Date(Date.now() + 5 * 60 * 1000),
                },
            }
        );

        await sendOtpMail(college_email, otp);

        return res.json({ message: "OTP sent successfully" });
    } catch (err) {
        console.error("Department login error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

// Logout
export const logout = (req: Request, res: Response): void => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout error:", err);
            res.status(500).json({ message: "Error during logout" });
            return;
        }
        res.clearCookie("sid");
        res.json({ message: "Logged out successfully" });
    });
};

export const paymentSimulation = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { candidateDetails, amount } = req.body;
        let simulateType = req.body.simulateType;

        if (amount === 0) {
            simulateType = "success";
        }

        if (!candidateDetails || !simulateType) {
            return res.status(400).json({
                message: "Candidate details, amount, and simulateType are required"
            });
        }

        if (freeCommunities.includes(candidateDetails.personal_details.basic_info.community) || candidateDetails.personal_details.basic_info.is_nri === true) {
            simulateType = "success";
        }

        if (simulateType === "success") {
            // Transform the data to match signup expectations with all required fields
            const applicationInfo = candidateDetails.personal_details.application_info;

            const transformedBody = {
                personal_details: {
                    basic_info: candidateDetails.personal_details.basic_info,
                    contact_info: candidateDetails.personal_details.contact_info,
                    application_info: {
                        application_count: applicationInfo.application_count,
                        application_type: applicationInfo.application_type,
                        program_code: applicationInfo.program_codes, // Rename to program_code
                        program_names: applicationInfo.program_names, // Include for later use
                        program_streams: applicationInfo.program_streams // Include for later use
                    }
                },
                selected_courses: candidateDetails.selected_courses,
                payment_details: {
                    ...candidateDetails.payment_details,
                    payment_method: "ccavenue", // Fix payment method
                    amount_paid: amount,
                    status: "success",
                    transaction_id: `TXN${Date.now()}`,
                    transaction_date: new Date().toISOString()
                }
            };

            const signupReq = {
                ...req,
                body: transformedBody
            } as Request<{}, {}, SignupRequest>;

            const result = await createCandidateService(transformedBody, req);

            return res.status(201).json(result);

        } else if (simulateType === "failure") {
            return res.status(400).json({
                message: "Payment failed",
                status: "failed"
            });
        } else {
            return res.status(400).json({
                message: "Invalid simulateType. Must be 'success' or 'failure'"
            });
        }

    } catch (err) {
        console.error("Payment simulation error:", err);
        return res.status(500).json({
            message: "Server error during payment simulation"
        });
    }
};


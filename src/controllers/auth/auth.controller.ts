import { Request, Response } from "express";
import StaffModel from "../../models/staffmaster.heber.model";
import { sendOtpMail } from "../../utils/send_otp";
import { signToken } from "../../utils/jwt";
import programsModel from "../../models/programs.model";
import CandidateAdmission from "../../models/candidate.model";
import { createCandidateWithRetry, getNextRegistrationNumber } from "../../utils/getNextRegistrationNumber";
import { getNextApplicationNumbers } from "../../models/auth/ApplicationCounter.model";


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

interface SignupRequest {
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
    stream?: "Aided" | "Self Financed";
    status?: "Applied" | "Under Review" | "Selected" | "Not Selected" | "Waitlisted" | "Cancelled";
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
export const candidateSignup = async (
    req: Request<{}, {}, SignupRequest>,
    res: Response
): Promise<Response> => {
    try {
        const { personal_details, selected_courses, payment_details } = req.body;

        if (!personal_details) {
            return res.status(400).json({
                message: "Personal details are required"
            });
        }

        // Basic validation
        const email = personal_details?.contact_info?.email;
        const mobile = personal_details?.contact_info?.mobile;

        if (!email || !mobile) {
            return res.status(400).json({
                message: "Email and mobile are required"
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                message: "Invalid email format"
            });
        }

        // const mobileRegex = /^[6-9]\d{9}$/;
        // if (!mobileRegex.test(mobile)) {
        //     return res.status(400).json({
        //         message: "Invalid mobile number format"
        //     });
        // }

        // Community validation
        const community = personal_details?.basic_info?.community;
        const communityNumber = personal_details?.basic_info?.community_number;

        if (freeCommunities.includes(community) && !communityNumber) {
            return res.status(400).json({
                message: "Community number is mandatory for SC / ST / SCA"
            });
        }

        // Duplicate check
        const existing = await CandidateAdmission.findOne({
            "personal_details.phone": mobile
        });

        if (existing) {
            return res.status(409).json({
                message: "Candidate already registered with this mobile number"
            });
        }

        // Validate application info
        const applicationInfo = personal_details.application_info;
        if (!applicationInfo) {
            return res.status(400).json({
                message: "Application information is required"
            });
        }

        const { program_code, application_type, application_count, program_names, program_streams } = applicationInfo;

        if (!program_code || !Array.isArray(program_code) || program_code.length === 0) {
            return res.status(400).json({
                message: "Program codes are required and must be an array"
            });
        }

        if (program_code.length !== application_count) {
            return res.status(400).json({
                message: `Program code count (${program_code.length}) does not match application count (${application_count})`
            });
        }

        // Validate that we have program_names and program_streams
        if (!program_names || program_names.length !== application_count) {
            return res.status(400).json({
                message: "Program names are required and must match application count"
            });
        }

        if (!program_streams || program_streams.length !== application_count) {
            return res.status(400).json({
                message: "Program streams are required and must match application count"
            });
        }

        const validApplicationTypes = ["UG", "PG", "Diploma", "Certificate", "PhD"] as const;
        if (!validApplicationTypes.includes(application_type as any)) {
            return res.status(400).json({
                message: `Invalid application type. Must be one of: ${validApplicationTypes.join(", ")}`
            });
        }

        // Validate programs exist in database (optional - you can skip if you trust the frontend)
        const programs = await programsModel.find({
            program_code: { $in: program_code }
        }).lean();

        const programMap: Record<string, string> = {};
        programs.forEach((p) => {
            if (p.program_code && p.program_name) {
                programMap[p.program_code] = p.program_name;
            }
        });

        // Check if any program codes are invalid (optional)
        const invalidPrograms = program_code.filter((code: string) => !programMap[code]);
        if (invalidPrograms.length > 0) {
            console.warn(`Warning: Program codes not found in database: ${invalidPrograms.join(", ")}`);
            // Continue anyway since we have program_names from frontend
        }

        // Create applications with all the data
        const applications: Application[] = [];
        const numbers = await getNextApplicationNumbers(program_code.length);

        for (let i = 0; i < program_code.length; i++) {
            applications.push({
                application_number: numbers[i],
                application_type,
                program_code: program_code[i],
                program_name: program_names[i] || programMap[program_code[i]] || "",
                stream: program_streams[i] as "Aided" | "Self Financed",
                status: "Applied",
                preference_order: i + 1
            });
        }

        // Calculate payment from selected_courses if available
        let total_amount = 0;
        if (selected_courses && selected_courses.length > 0) {
            total_amount = selected_courses.reduce((sum, item) => sum + (item.course.application_fee || 0), 0);
        } else {
            // Fallback calculation
            const isFreeCommunity = freeCommunities.includes(community);
            const perApplicationAmount = isFreeCommunity
                ? 0
                : application_type === "UG"
                    ? 100
                    : application_type === "PG"
                        ? 160
                        : 0;
            total_amount = perApplicationAmount * application_count;
        }

        const payment_status = total_amount === 0 ? "success" :
            (payment_details?.status === "success" ? "success" : "pending");

        // Validate date of birth
        const dateOfBirth = new Date(personal_details.basic_info.date_of_birth);
        if (isNaN(dateOfBirth.getTime())) {
            return res.status(400).json({
                message: "Invalid date of birth format"
            });
        }

        const age = new Date().getFullYear() - dateOfBirth.getFullYear();
        const monthDiff = new Date().getMonth() - dateOfBirth.getMonth();
        const dayDiff = new Date().getDate() - dateOfBirth.getDate();
        const exactAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

        if (exactAge < 16 || exactAge > 100) {
            return res.status(400).json({
                message: "Age must be between 16 and 100 years"
            });
        }

        const registration_number = await getNextRegistrationNumber();

        // Create candidate data with all required fields
        const candidateData = {
            registration_number,
            personal_details: {
                fullName: personal_details.basic_info.name,
                dateOfBirth: dateOfBirth,
                gender: personal_details.basic_info.gender as "Male" | "Female" | "Other" | "Prefer not to say",
                email: personal_details.contact_info.email,
                phone: personal_details.contact_info.mobile,
                community: personal_details.basic_info.community == "Others" ? personal_details.basic_info.other_community : personal_details.basic_info.community,
                nationality: "Indian",
            },
            application_preferences: {
                applications
            },
            payment: {
                amount: total_amount,
                status: payment_status as "pending" | "partial" | "success" | "refunded",
                transaction_id: payment_details?.transaction_id,
                payment_date: payment_details?.transaction_date ? new Date(payment_details.transaction_date) : undefined,
                payment_method: payment_details?.payment_method
            },
            admission_status: {
                current: "Applied" as const
            },
            academic_background: {
                programmeType: application_type
            },
            // Add empty objects for required fields to avoid validation errors
            address: {
                present_address: {
                    country: "India",
                    state: "",
                    district: "",
                    pincode: ""
                },
                permanent_address: {
                    same_as_present: true,
                    country: "India"
                }
            },
            parents: {
                father_name: "",
                mother_name: ""
            },
            metadata: {
                ip_address: req.ip || req.socket.remoteAddress,
                user_agent: req.headers?.['user-agent'] || "Unknown",
                version: 1,
                is_active: true,
                submitted_at: new Date()
            }
        };

        const candidate = await createCandidateWithRetry(candidateData);

        const candidateId = candidate._id.toString();

        // Generate token
        const token = signToken({
            id: candidateId,
            registration_number,
            role: "candidate"
        });

        // Set session
        if (req.session) {
            req.session.user = {
                id: candidateId,
                registration_number,
                role: "candidate"
            };
        }

        // Generate callback URL
        const callback_url = payment_status === "success"
            ? `/application-success?registration_number=${registration_number}`
            : `/payment?registration_number=${registration_number}&amount=${total_amount}`;

        return res.status(201).json({
            message: "Registration successful",
            registration_number,
            applications: applications.map(app => ({
                application_number: app.application_number,
                program_code: app.program_code,
                program_name: app.program_name,
                stream: app.stream,
                preference_order: app.preference_order
            })),
            payment: {
                amount: total_amount,
                status: payment_status
            },
            token,
            callback_url
        });

    } catch (err: unknown) {
        console.error("Signup error:", err);

        const mongoError = err as MongoError;
        if (mongoError.code === 11000) {
            const field = mongoError.keyPattern ? Object.keys(mongoError.keyPattern)[0] : "unknown";
            const value = mongoError.keyValue ? Object.values(mongoError.keyValue)[0] : "unknown";
            return res.status(409).json({
                message: `Duplicate value for ${field}: ${value}. Please use different value.`
            });
        }

        const validationError = err as ValidationError;
        if (validationError.name === "ValidationError") {
            const errors = Object.values(validationError.errors).map((e: { message: string }) => e.message);
            return res.status(400).json({
                message: "Validation failed",
                errors
            });
        }

        const error = err as Error;
        return res.status(500).json({
            message: "Internal server error",
            ...(process.env.NODE_ENV === "development" && { error: error.message })
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

        const user = {
            id: candidate._id.toString(),
            registration_number: candidate.registration_number,
            role: "candidate",
            payment_status: candidate.payment?.status,
        };

        const token = signToken(user);

        if (req.session) {
            req.session.user = {
                id: candidate._id.toString(),
                registration_number: candidate.registration_number,
                role: "candidate",
                payment_status: candidate.payment?.status || "pending",
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

            return await candidateSignup(signupReq, res);

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
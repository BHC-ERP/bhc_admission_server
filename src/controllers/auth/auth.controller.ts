import { Request, Response } from "express";
import StaffModel from "../../models/staffmaster.heber.model";
import { sendOtpMail } from "../../utils/send_otp";
import { signToken } from "../../utils/jwt";
import programsModel from "../../models/programs.model";
import CandidateAdmission from "../../models/candidate.model";
import { createCandidateWithRetry, getNextRegistrationNumber } from "../../utils/getNextRegistrationNumber";
import { ApplicationCounter, getNextApplicationNumbers } from "../../models/auth/ApplicationCounter.model";
import { sendSMSService } from "../../services/sms.service";
import { sendMailService } from "../../services/mail.service";


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
    is_nri: boolean;
    religion: string;
    christian_denomination?: string;
    christianDenominationOther?: string;
    diocese?: string;
    dioceseState?: string;
    caste: string;
    special_status: "None" | "Orphan" | "Semi-Orphan" | "Deserted";
    is_differently_abled: boolean;
    disability_type?: string;
    disability_percentage?: number;
    is_ex_servicemen: boolean;
    is_first_graduate: boolean;
    emis_number?: string;
    umis_number?: string;
    aadhar_number?: string;
    blood_group: string;
    passport_number?: string;
}

interface AddressDetail {
    type: "Urban" | "Rural";
    door_no: string;
    street: string;
    village_town: string;
    pincode: string;
    country: string;
    district: string;
    state: string;
}

interface Address {
    present_address: AddressDetail;
    permanent_address: AddressDetail & { same_as_present: boolean };
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
    address: Address;
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
export const candidateSignup = async (
    req: Request<{}, {}, SignupRequest>,
    res: Response
): Promise<Response> => {
    try {
        const { personal_details, selected_courses, payment_details } = req.body;

        // DEBUG: Log incoming request
        console.log("========== CANDIDATE SIGNUP DEBUG ==========");
        console.log("1. Received payload:", JSON.stringify({
            email: personal_details?.contact_info?.email,
            mobile: personal_details?.contact_info?.mobile,
            community: personal_details?.basic_info?.community,
            application_count: personal_details?.application_info?.application_count,
            program_codes: personal_details?.application_info?.program_code
        }, null, 2));

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

        // Community validation
        const community = personal_details?.basic_info?.community;
        const communityNumber = personal_details?.basic_info?.community_number;

        // DEBUG: Community check
        console.log("2. Community validation:", {
            community,
            communityNumber,
            isFreeCommunity: freeCommunities.includes(community)
        });

        if (freeCommunities.includes(community) && !communityNumber) {
            return res.status(400).json({
                message: "Community number is mandatory for SC / ST / SCA"
            });
        }

        // Duplicate check
        // DEBUG: Check both mobile and email for duplicates
        console.log("3. Checking duplicates for:", { mobile, email });

        const existing = await CandidateAdmission.findOne({
            $or: [
                { "personal_details.phone": mobile },
                { "personal_details.aadharNumber": personal_details?.basic_info?.aadhar_number }
            ]
        });

        if (existing) {
            console.log("3a. Duplicate found:", {
                registration_number: existing.registration_number,
                matched_field: existing.personal_details?.phone === mobile ? "Mobile" : "Aadhar"
            });
            return res.status(409).json({
                message: existing.personal_details?.phone === mobile 
                    ? "Candidate already registered with this mobile number"
                    : "Candidate already registered with this Aadhar number"
            });
        }
        console.log("3b. No duplicates found");

        // Validate application info
        const applicationInfo = personal_details.application_info;
        if (!applicationInfo) {
            return res.status(400).json({
                message: "Application information is required"
            });
        }

        const { program_code, application_type, application_count, program_names, program_streams } = applicationInfo;

        // DEBUG: Application info
        console.log("4. Application info:", {
            application_type,
            application_count,
            program_code_count: program_code?.length,
            program_names_count: program_names?.length,
            program_streams_count: program_streams?.length
        });

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

        // Validate programs exist in database
        console.log("5. Validating programs in database...");
        const programs = await programsModel.find({
            program_code: { $in: program_code }
        }).lean();

        const programMap: Record<string, string> = {};
        programs.forEach((p) => {
            if (p.program_code && p.program_name) {
                programMap[p.program_code] = p.program_name;
            }
        });

        // Check if any program codes are invalid
        const invalidPrograms = program_code.filter((code: string) => !programMap[code]);
        if (invalidPrograms.length > 0) {
            console.warn(`5a. Warning: Program codes not found in database: ${invalidPrograms.join(", ")}`);
        } else {
            console.log("5b. All programs validated successfully");
        }

        // Create applications with all the data
        console.log("6. Generating application numbers...");
        const applications: Application[] = [];
        const numbers = await getNextApplicationNumbers(program_code.length);
        console.log("6a. Application numbers generated:", numbers);

        for (let i = 0; i < program_code.length; i++) {
            applications.push({
                application_number: numbers[i],
                application_type,
                program_code: program_code[i],
                program_name: program_names[i] || programMap[program_code[i]] || "",
                stream: program_streams[i] as "Aided" | "Self-Finance",
                status: "Draft",
                preference_order: i + 1
            });
        }

        // Calculate payment from selected_courses if available
        let total_amount = 0;
        if (selected_courses && selected_courses.length > 0) {
            total_amount = selected_courses.reduce((sum, item) => sum + (item.course.application_fee || 0), 0);
            console.log("7. Payment calculated from selected_courses:", {
                selected_courses_count: selected_courses.length,
                total_amount
            });
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
            console.log("7. Payment calculated from fallback:", {
                isFreeCommunity,
                perApplicationAmount,
                application_count,
                total_amount
            });
        }

        const payment_status = total_amount === 0 ? "exempted" :
            (payment_details?.status === "success" ? "success" : (payment_details?.status === "exempted" ? "exempted" : "pending"));

        console.log("8. Payment status determined:", { total_amount, payment_status });

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

        console.log("9. Age validation:", {
            dateOfBirth: personal_details.basic_info.date_of_birth,
            calculated_age: exactAge,
            meets_criteria: exactAge >= 15 && exactAge <= 100
        });

        if (exactAge < 15 || exactAge > 100) {
            return res.status(400).json({
                message: "Age must be between 15 and 100 years"
            });
        }

        const registration_number = await getNextRegistrationNumber();
        console.log("10. Registration number generated:", registration_number);

        // Create candidate data with all required fields
        const bi = personal_details.basic_info || {} as any;
        const ci = personal_details.contact_info || {} as any;
        const ai = personal_details.application_info || {} as any;
        const ad = personal_details.address || { present_address: {}, permanent_address: {} } as any;
        const pad = ad.present_address || {};
        const pmd = ad.permanent_address || {};


        const candidateData = {
            registration_number,
            appliedProgrammeType: application_type,
            personal_details: {
                fullName: bi.name,
                dateOfBirth: dateOfBirth,
                gender: bi.gender as "Male" | "Female" | "Other",
                email: ci.email,
                phone: ci.mobile,
                community: bi.community == "Others" ? bi.other_community : bi.community,
                community_number: bi.community_number || undefined,
                nationality: bi.is_nri ? "Outside Indian" : "Indian",
                aadharNumber: bi.aadhar_number,
                bloodGroup: bi.blood_group as any,
                religion: bi.religion === "Others" ? "Other" : bi.religion as any,
                christianDenomination: bi.christian_denomination,
                christianDenominationOther: bi.christianDenominationOther,
                diocese: bi.diocese,
                dioceseState: bi.dioceseState,
                caste: bi.caste,
                passportNumber: bi.passport_number,
                differentlyAbled: bi.is_differently_abled,
                differentlyAbledType: bi.disability_type,
                differentlyAbledPercentage: bi.disability_percentage,
                childOfExServicemen: bi.is_ex_servicemen
            },
            application_preferences: {
                applications
            },
            payment: [{
                amount: total_amount,
                status: payment_status as "pending" | "partial" | "success" | "refunded" | "exempted" | "failed",
                transaction_id: payment_details?.transaction_id,
                payment_date: payment_details?.transaction_date ? new Date(payment_details.transaction_date) : undefined,
                payment_method: payment_details?.payment_method
            }],
            admission_status: {
                current: "Draft" as const
            },
            academic_background: {
                programmeType: application_type,
                umis_number: bi.umis_number,
                school_education: {
                    is_first_generation_learner: bi.is_first_graduate,
                    emis_number: bi.emis_number
                }
            },
            address: {
                present_address: {
                    door_no: pad.door_no,
                    street: pad.street,
                    village_town: pad.village_town,
                    district: pad.district,
                    state: pad.state,
                    country: pad.country || "India",
                    pincode: pad.pincode,
                    type: pad.type
                },
                permanent_address: {
                    same_as_present: pmd.same_as_present,
                    door_no: pmd.door_no,
                    street: pmd.street,
                    village_town: pmd.village_town,
                    district: pmd.district,
                    state: pmd.state,
                    country: pmd.country || "India",
                    pincode: pmd.pincode,
                    type: pmd.type
                }
            },
            parents: {
                father_name: "",
                mother_name: "",
                guardian: {
                    is_guardian: bi.special_status && bi.special_status !== "None",
                    is_orphan: bi.special_status === "Orphan",
                    is_semi_orphan: bi.special_status === "Semi-Orphan",
                    is_deserted: bi.special_status === "Deserted"
                }
            },
            metadata: {
                ip_address: req.ip || req.socket?.remoteAddress,
                user_agent: req.headers?.['user-agent'] || "Unknown",
                version: 1,
                is_active: true,
                submitted_at: new Date()
            }
        };

        console.log("12. Attempting to create candidate in database...");
        const candidate = await createCandidateWithRetry(candidateData);
        console.log("12a. Candidate created successfully with ID:", candidate._id);

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
            console.log("13. Session set for candidate");
        }

        // REMOVED THE PROBLEMATIC QUERY HERE

        const candidate_name = candidate.personal_details?.fullName || 'Candidate';
        const phone = candidate.personal_details?.phone;

        //Send SMS (non-blocking)
        if (phone) {
            const message = `Dear ${candidate_name}, Your Registration No. is:${registration_number} and the Password is:${phone} - Bishop Heber College`;
            console.log("14. Sending SMS to:", phone);
            // Don't await to avoid blocking
            sendSMSService(phone, message).catch(err => {
                console.error("SMS sending failed:", err);
            });
        }

        // Send Email
        if (email) {
            console.log("15. Sending email to:", email);
            // Don't await to avoid blocking
            sendMailService(email, registration_number.toString(), phone!).catch(err => {
                console.error("Email sending failed:", err);
            });
        }

        // Generate callback URL
        const callback_url = payment_status === "success"
            ? `/application-success?registration_number=${registration_number}`
            : `/payment?registration_number=${registration_number}&amount=${total_amount}`;

        console.log("16. Signup completed successfully for:", { registration_number, email, phone });
        console.log("========== END DEBUG ==========");

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
        console.error("========== SIGNUP ERROR DEBUG ==========");
        console.error("Error details:", err);

        if (err instanceof Error) {
            console.error("Error name:", err.name);
            console.error("Error message:", err.message);
            console.error("Error stack:", err.stack);
        }

        const mongoError = err as MongoError;
        if (mongoError.code === 11000) {
            const field = mongoError.keyPattern ? Object.keys(mongoError.keyPattern)[0] : "unknown";
            const value = mongoError.keyValue ? Object.values(mongoError.keyValue)[0] : "unknown";
            console.error("Duplicate key error:", { field, value });
            return res.status(409).json({
                message: `Duplicate value for ${field}: ${value}. Please use different value.`
            });
        }

        const validationError = err as ValidationError;
        if (validationError.name === "ValidationError") {
            const errors = Object.values(validationError.errors).map((e: { message: string }) => e.message);
            console.error("Validation errors:", errors);
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
            payment_status: candidate.payment && candidate.payment.length > 0 ? candidate.payment[candidate.payment.length - 1].status : "pending",
        };

        const token = signToken(user);

        if (req.session) {
            req.session.user = {
                id: candidate._id.toString(),
                registration_number: candidate.registration_number,
                role: "candidate",
                payment_status: candidate.payment && candidate.payment.length > 0 ? candidate.payment[candidate.payment.length - 1].status : "pending",
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
            simulateType = "exempted";
        }

        if (!candidateDetails) {
            return res.status(400).json({ message: "Candidate details are required" });
        }

        if (!simulateType) {
            return res.status(400).json({ message: "simulateType is required" });
        }

        const pd = candidateDetails.personal_details || {};
        const basicInfo = pd.basic_info || {};
        const contactInfo = pd.contact_info || {};
        const appInfo = pd.application_info || {};
        const address = pd.address || { present_address: {}, permanent_address: {} };

        if (freeCommunities.includes(basicInfo.community) || basicInfo.is_nri === true) {
            simulateType = "exempted";
        }

        if (simulateType === "exempted") {
            const transformedBody = {
                personal_details: {
                    basic_info: basicInfo,
                    contact_info: contactInfo,
                    application_info: {
                        application_count: appInfo.application_count,
                        application_type: appInfo.application_type,
                        program_code: appInfo.program_codes || appInfo.program_code,
                        program_names: appInfo.program_names,
                        program_streams: appInfo.program_streams
                    },
                    address: {
                        present_address: address.present_address || {},
                        permanent_address: address.permanent_address || {}
                    }
                },
                selected_courses: candidateDetails.selected_courses,
                payment_details: {
                    ...(candidateDetails.payment_details || {}),
                    payment_method: "Free Applications",
                    amount_paid: amount,
                    status: simulateType,
                    transaction_id: candidateDetails.payment_details?.transaction_id || (simulateType === "exempted" ? `BHC-EXEMPT-${Date.now()}` : `TXN${Date.now()}`),
                    transaction_date: candidateDetails.payment_details?.transaction_date || new Date().toISOString()
                }
            };

            const signupReq = {
                ...req,
                body: transformedBody
            } as Request<{}, {}, SignupRequest>;

            return await candidateSignup(signupReq, res);




        } else if (simulateType === "failure") {
            return res.status(400).json({ message: "Payment failed", status: "failed" });
        } else {
            return res.status(400).json({ message: "Invalid simulateType. Must be 'success', 'exempted' or 'failure'" });
        }

    } catch (err) {
        console.error("Payment simulation error:", err);
        return res.status(500).json({ message: "Server error during payment simulation" });
    }
};


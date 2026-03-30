import { Request } from "express";
import CandidateAdmission from "../models/candidate.model";
import programsModel from "../models/programs.model";
import { getNextApplicationNumbers } from "../models/auth/ApplicationCounter.model";
import { createCandidateWithRetry, getNextRegistrationNumber } from "../utils/getNextRegistrationNumber";
import { signToken } from "../utils/jwt";

// TYPES
export interface SignupRequest {
    personal_details: {
        basic_info: {
            name: string;
            gender: string;
            date_of_birth: string;
            community: string;
            community_number?: string;
            other_community?: string;
            is_nri?: boolean;
        };
        contact_info: {
            mobile: string;
            email: string;
        };
        application_info: {
            application_count: number;
            application_type: "UG" | "PG" | "Diploma" | "Certificate" | "PhD";
            program_code: string[];
            program_names: string[];
            program_streams: string[];
        };
    };
    selected_courses?: any[];
    payment_details?: any;
}

const freeCommunities = ["SC", "ST", "SCA"];

// 🚀 SERVICE FUNCTION
export const createCandidateService = async (
    body: SignupRequest,
    req: Request
) => {
    try {
        const { personal_details, selected_courses, payment_details } = body;

        if (!personal_details) throw new Error("Personal details are required");

        const email = personal_details.contact_info?.email;
        const mobile = personal_details.contact_info?.mobile;

        if (!email || !mobile) {
            throw new Error("Email and mobile are required");
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error("Invalid email format");
        }

        // COMMUNITY VALIDATION
        const community = personal_details.basic_info.community;
        const communityNumber = personal_details.basic_info.community_number;

        if (freeCommunities.includes(community) && !communityNumber) {
            throw new Error("Community number is mandatory for SC / ST / SCA");
        }

        // DUPLICATE CHECK
        const existing = await CandidateAdmission.findOne({
            "personal_details.phone": mobile
        });

        if (existing) {
            throw new Error("Candidate already registered with this mobile number");
        }

        const applicationInfo = personal_details.application_info;
        if (!applicationInfo) throw new Error("Application information is required");

        const {
            program_code,
            application_type,
            application_count,
            program_names,
            program_streams
        } = applicationInfo;

        if (!program_code?.length) {
            throw new Error("Program codes are required");
        }

        if (program_code.length !== application_count) {
            throw new Error("Program count mismatch");
        }

        // PROGRAM FETCH
        const programs = await programsModel.find({
            program_code: { $in: program_code }
        }).lean();

        const programMap: Record<string, string> = {};
        programs.forEach((p: any) => {
            programMap[p.program_code] = p.program_name;
        });

        // APPLICATIONS
        const applications = [];
        const numbers = await getNextApplicationNumbers(program_code.length);

        for (let i = 0; i < program_code.length; i++) {
            applications.push({
                application_number: numbers[i],
                application_type,
                program_code: program_code[i],
                program_name: program_names[i] || programMap[program_code[i]] || "",
                stream: program_streams[i],
                status: "Draft",
                preference_order: i + 1,
                transaction_id: payment_details?.transaction_id
            });
        }

        // PAYMENT
        let total_amount = 0;

        if (selected_courses?.length) {
            total_amount = selected_courses.reduce(
                (sum: number, item: any) =>
                    sum + (item.course?.application_fee || 0),
                0
            );
        } else {
            const isFree = freeCommunities.includes(community);
            const perAmount =
                isFree ? 0 : application_type === "UG" ? 100 : 160;
            total_amount = perAmount * application_count;
        }

        const payment_status =
            total_amount === 0
                ? "success"
                : payment_details?.status === "success"
                    ? "success"
                    : "pending";

        // DOB VALIDATION
        const dateOfBirth = new Date(personal_details.basic_info.date_of_birth);
        if (isNaN(dateOfBirth.getTime())) {
            throw new Error("Invalid date of birth");
        }

        // REG NUMBER
        const registration_number = await getNextRegistrationNumber();

        const bi = (personal_details as any).basic_info || {} as any;
        const ci = (personal_details as any).contact_info || {} as any;
        const ai = (personal_details as any).application_info || {} as any;
        const ad = (personal_details as any).address || { present_address: {}, permanent_address: {} } as any;
        const pad = ad.present_address || {};
        const pmd = ad.permanent_address || {};

        // FINAL DATA
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
                community_number: bi.community_number || undefined, // Use undefined for sparse index
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
                status: payment_status,
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
                ip_address: req.ip || req.socket.remoteAddress,
                user_agent: req.headers?.['user-agent'] || "Unknown",
                version: 1,
                is_active: true,
                submitted_at: new Date()
            }
        };

        const candidate = await createCandidateWithRetry(candidateData);

        const token = signToken({
            id: candidate._id.toString(),
            registration_number,
            role: "candidate"
        });

        return {
            message: "Registration successful",
            registration_number,
            applications,
            payment: {
                amount: total_amount,
                status: payment_status
            },
            token
        };

    } catch (err: any) {
        if (err.code === 11000) {
            throw new Error("Duplicate entry detected");
        }
        throw err;
    }
};

/**
 * 🚀 ADD MORE COURSES SERVICE
 * Appends new applications and payment to an existing candidate
 */
export const addMoreCandidateCoursesService = async (
    candidateId: string,
    selected_courses: any[],
    payment_details: any
) => {
    try {
        const candidate = await CandidateAdmission.findById(candidateId);
        if (!candidate) throw new Error("Candidate not found");

        if (!selected_courses?.length) {
            throw new Error("No courses selected to add");
        }

        const program_codes = selected_courses.map(c => c.course?.code || c.program_code);
        const program_names = selected_courses.map(c => c.course?.name || c.program_name);
        const program_streams = selected_courses.map(c => c.course?.stream || c.stream);

        // Fetch programs for validation and names
        const programs = await programsModel.find({
            program_code: { $in: program_codes }
        }).lean();

        const programMap: Record<string, string> = {};
        programs.forEach((p: any) => {
            programMap[p.program_code] = p.program_name;
        });

        // 1. Generate NEW Application Numbers
        const numbers = await getNextApplicationNumbers(program_codes.length);

        const newApplications: any[] = [];

        if (!candidate.application_preferences) {
            (candidate as any).application_preferences = { applications: [] };
        }

        // Use a non-null assertion or cast since we just initialized it above
        const appPrefs = candidate.application_preferences as any;
        if (!appPrefs.applications) {
            appPrefs.applications = [];
        }

        const existingApplications = appPrefs.applications as any[];
        const existingCount = existingApplications.length;

        for (let i = 0; i < program_codes.length; i++) {
            newApplications.push({
                application_number: numbers[i],
                application_type: candidate.appliedProgrammeType,
                program_code: program_codes[i],
                program_name: program_names[i] || programMap[program_codes[i]] || "",
                stream: program_streams[i],
                status: candidate?.admission_status?.current === "Draft" ? "Draft" : "Applied",
                preference_order: existingCount + i + 1,
                transaction_id: payment_details.transaction_id
            });
        }

        // 2. Append applications to candidate
        existingApplications.push(...newApplications);

        // 3. Append payment record
        if (!candidate.payment) {
            (candidate as any).payment = [];
        }
        (candidate.payment as any[]).push({
            amount: payment_details.amount_paid || 0,
            status: "success",
            transaction_id: payment_details.transaction_id,
            payment_date: payment_details.transaction_date ? new Date(payment_details.transaction_date) : new Date(),
            payment_method: payment_details.payment_method || "ccavenue"
        });

        await candidate.save();

        return {
            success: true,
            message: "Additional courses added successfully",
            newApplications,
            registration_number: candidate.registration_number
        };

    } catch (err: any) {
        console.error("Error in addMoreCandidateCoursesService:", err);
        throw err;
    }
};

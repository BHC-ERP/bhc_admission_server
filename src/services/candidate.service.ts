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
                preference_order: i + 1
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

        // FINAL DATA
        const candidateData = {
            registration_number,
            personal_details: {
                fullName: personal_details.basic_info.name,
                dateOfBirth,
                gender: personal_details.basic_info.gender,
                email,
                phone: mobile,
                community:
                    community === "Others"
                        ? personal_details.basic_info.other_community
                        : community,
                community_number:
                    personal_details.basic_info.community_number?.trim() || undefined,
                nationality: personal_details.basic_info.is_nri
                    ? "Outside Indian"
                    : "Indian"
            },
            application_preferences: { applications },
            payment: {
                amount: total_amount,
                status: payment_status,
                transaction_id: payment_details?.transaction_id
            },
            metadata: {
                ip_address: req.ip,
                user_agent: req.headers["user-agent"]
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
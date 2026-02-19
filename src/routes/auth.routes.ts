import { Router, Request, Response } from "express";
import { signToken } from "../utils/jwt";
import candidateModel from "../models/candidate.model";
import programsModel from "../models/programs.model";
import { sendOtpMail } from "../utils/send_otp";
import StaffModel from "../models/staffmaster.heber.model";
import mongoose from "mongoose";

const router = Router();

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

// Types for the request payload
interface BasicInfo {
  name: string;
  gender: string;
  date_of_birth: string;
  community: string;
  community_number?: string;
}

interface ContactInfo {
  mobile: string;
  email: string;
}

interface ApplicationInfo {
  application_count: number;
  application_type: "UG" | "PG" | "Diploma" | "Certificate" | "PhD";
  program_code: string[];
}

interface PersonalDetails {
  basic_info: BasicInfo;
  contact_info: ContactInfo;
  application_info: ApplicationInfo;
}

interface SignupRequest {
  personal_details: PersonalDetails;
}

// Program type
interface Program {
  program_code: string;
  program_name: string;
  _id: string;
}

// Application type
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

// Counter Schema for Application Numbers
const ApplicationCounterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  sequence_value: { type: Number, required: true, default: 260000 } // Start from 260000
});

const ApplicationCounter = mongoose.model("ApplicationCounter", ApplicationCounterSchema);

// Function to get next application number (atomic operation)
// This will generate: 260001, 260002, 260003, 260004, ...
async function getNextApplicationNumbers(count: number): Promise<number[]> {
  const counter = await ApplicationCounter.findOneAndUpdate(
    { name: "application_number" },
    { $inc: { sequence_value: count } }, // increment by total count
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  const startNumber = counter.sequence_value - count + 1;

  return Array.from({ length: count }, (_, i) => startNumber + i);
}

// MongoDB duplicate key error
interface MongoError extends Error {
  code?: number;
  keyPattern?: Record<string, any>;
  keyValue?: Record<string, any>;
}

// Mongoose validation error
interface ValidationError extends Error {
  name: "ValidationError";
  errors: Record<string, { message: string }>;
}

// Staff type
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

// Login request type
interface LoginRequest {
  registration_number: number;
  mobile: number;
}

// Department login request type
interface DepartmentLoginRequest {
  college_email: string;
}

// Verify OTP request type
interface VerifyOTPRequest {
  college_email: string;
  otp: string;
}

router.post("/login", async (req: Request<{}, {}, LoginRequest>, res: Response): Promise<Response> => {
  try {
    const { registration_number, mobile } = req.body;

    /* ---------- BASIC VALIDATION ---------- */
    if (!registration_number || !mobile) {
      return res.status(400).json({
        message: "Registration number and mobile are required"
      });
    }

    /* ---------- DB CHECK ---------- */
    const candidate = await candidateModel.findOne({
      registration_number
    }).lean();

    if (!candidate) {
      return res.status(401).json({
        message: "Invalid Registration Number"
      });
    }

    // Check if mobile matches the candidate's mobile
    const candidateMobile = candidate.personal_details?.phone!;

    if (candidateMobile !== mobile.toString()) {
      return res.status(401).json({
        message: "Invalid Mobile Number"
      });
    }

    /* ---------- USER PAYLOAD (FROM DB ONLY) ---------- */
    const user = {
      id: candidate._id.toString(),
      registration_number: candidate.registration_number,
      role: "candidate",
      payment_status: candidate.payment?.status || "pending",
      userData: candidate.personal_details
    };

    /* ---------- JWT ---------- */
    const token = signToken(user);

    /* ---------- SESSION ---------- */
    if (req.session) {
      req.session.user = {
        id: candidate._id.toString(),
        registration_number: candidate.registration_number,
        role: "candidate",
        payment_status: candidate.payment?.status || "pending",
        userData: candidate.personal_details
      };
    }

    /* ---------- RESPONSE ---------- */
    return res.json({
      message: "Login successful",
      token,
      user
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

router.post("/signup", async (req: Request<{}, {}, SignupRequest>, res: Response): Promise<Response> => {
  try {
    const { personal_details } = req.body;

    /* -----------PAYLOAD WITH SC -----------
        {
          "personal_details": {
            "basic_info": {
              "name": "Ravi M",
              "gender": "Male",
              "date_of_birth": "2003-08-07",
              "community": "SC",
              "community_number": "TN-SC-982341"
            },
            "contact_info": {
              "mobile": "9876543210",
              "email": "ravi@bhc.edu.in"
            },
            "application_info": {
              "application_count": 2,
              "application_type": "UG",
              "program_code": [
                "UG-BA-EG",
                "UG-BA-EC"
              ]
            }
          }
        }
    */

    /* -----------PAYLOAD WITH NOT SC -----------
       {
         "personal_details": {
           "basic_info": {
             "name": "karthi k",
             "gender": "Male",
             "date_of_birth": "2004-05-12",
             "community": "BC",
             "community_number": ""
           },
           "contact_info": {
             "mobile": "9123456789",
             "email": "karthik@bhc.edu.in"
           },
           "application_info": {
             "application_count": 1,
             "application_type": "UG",
             "program_code": [
               "UG-BA-PL"
             ]
           }
         }
       }
    */

    // Validate personal_details exists
    if (!personal_details) {
      return res.status(400).json({
        message: "Personal details are required"
      });
    }

    /* ---------- BASIC VALIDATION ---------- */
    const email = personal_details?.contact_info?.email;
    const mobile = personal_details?.contact_info?.mobile;

    if (!email || !mobile) {
      return res.status(400).json({
        message: "Email and mobile are required"
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email format"
      });
    }

    // Mobile format validation (Indian mobile number)
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(mobile)) {
      return res.status(400).json({
        message: "Invalid mobile number format"
      });
    }

    /* ---------- COMMUNITY VALIDATION ---------- */
    const community = personal_details?.basic_info?.community;
    const communityNumber = personal_details?.basic_info?.community_number;
    const freeCommunities = ["SC", "ST", "SCA"];

    if (freeCommunities.includes(community) && !communityNumber) {
      return res.status(400).json({
        message: "Community number is mandatory for SC / ST / SCA"
      });
    }

    /* ---------- DUPLICATE CHECK (MOBILE ONLY) ---------- */
    const existing = await candidateModel.findOne({
      "personal_details.phone": mobile
    });

    if (existing) {
      return res.status(409).json({
        message: "Candidate already registered with this mobile number"
      });
    }

    /* ---------- REGISTRATION NUMBER ---------- */
    const lastCandidate = await candidateModel
      .findOne({}, { registration_number: 1 })
      .sort({ registration_number: -1 })
      .lean();

    let registration_number = 202600001;
    if (lastCandidate?.registration_number) {
      registration_number = lastCandidate.registration_number + 1;
    }

    /* ---------- BUILD APPLICATIONS WITH UNIQUE NUMBERS ---------- */
    const applicationInfo = personal_details.application_info;

    if (!applicationInfo) {
      return res.status(400).json({
        message: "Application information is required"
      });
    }

    const { program_code, application_type, application_count } = applicationInfo;

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

    // Validate application_type
    const validApplicationTypes = ["UG", "PG", "Diploma", "Certificate", "PhD"] as const;
    if (!validApplicationTypes.includes(application_type as any)) {
      return res.status(400).json({
        message: `Invalid application type. Must be one of: ${validApplicationTypes.join(", ")}`
      });
    }

    const programs = await programsModel.find({
      program_code: { $in: program_code }
    }).lean();

    const programMap: Record<string, string> = {};
    programs.forEach((p) => {
      if (p.program_code && p.program_name) {
        programMap[p.program_code] = p.program_name;
      }
    });

    // Check if all program codes are valid
    const invalidPrograms = program_code.filter((code: string) => !programMap[code]);
    if (invalidPrograms.length > 0) {
      return res.status(400).json({
        message: `Invalid program codes: ${invalidPrograms.join(", ")}`
      });
    }

    const applications: Application[] = [];

    const numbers = await getNextApplicationNumbers(program_code.length);

    for (let i = 0; i < program_code.length; i++) {
      applications.push({
        application_number: numbers[i],
        application_type,
        program_code: program_code[i],
        program_name: programMap[program_code[i]] || "",
        stream: "Aided",
        status: "Applied"
      });
    }

    /* ---------- APPLICATION AMOUNT ---------- */
    const isFreeCommunity = freeCommunities.includes(community);
    const perApplicationAmount = isFreeCommunity
      ? 0
      : application_type === "UG"
        ? 100
        : application_type === "PG"
          ? 160
          : 0;

    const total_amount = perApplicationAmount * application_count;
    const payment_status = total_amount === 0 ? "completed" : "pending";

    // Validate date of birth
    const dateOfBirth = new Date(personal_details.basic_info.date_of_birth);
    if (isNaN(dateOfBirth.getTime())) {
      return res.status(400).json({
        message: "Invalid date of birth format"
      });
    }

    // Validate age (must be between 16 and 100)
    const age = new Date().getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = new Date().getMonth() - dateOfBirth.getMonth();
    const dayDiff = new Date().getDate() - dateOfBirth.getDate();

    const exactAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

    if (exactAge < 16 || exactAge > 100) {
      return res.status(400).json({
        message: "Age must be between 16 and 100 years"
      });
    }

    /* ---------- MAP PAYLOAD TO SCHEMA ---------- */
    const candidateData = {
      registration_number,
      personal_details: {
        fullName: personal_details.basic_info.name,
        dateOfBirth: dateOfBirth,
        gender: personal_details.basic_info.gender as "Male" | "Female" | "Other" | "Prefer not to say",
        email: personal_details.contact_info.email,
        phone: personal_details.contact_info.mobile,
        community: personal_details.basic_info.community,
        nationality: "Indian",
        // Add other fields as needed
      },
      application_preferences: {
        applications
      },
      payment: {
        amount: total_amount,
        status: payment_status as "pending" | "partial" | "completed" | "refunded"
      },
      admission_status: {
        current: "Applied" as const
      },
      academic_background: {
        programmeType: application_type
      },
      metadata: {
        ip_address: req.ip || req.socket.remoteAddress,
        user_agent: req.get("user-agent") || "Unknown",
        version: 1,
        is_active: true
      }
    };

    /* ---------- CREATE CANDIDATE ---------- */
    const candidate = await candidateModel.create(candidateData);

    const candidateId = candidate._id.toString();

    /* ---------- JWT ---------- */
    const token = signToken({
      id: candidateId,
      registration_number,
      role: "candidate"
    });

    /* ---------- SESSION ---------- */
    if (req.session) {
      req.session.user = {
        id: candidateId,
        registration_number,
        role: "candidate"
      };
    }

    /* ---------- CALLBACK URL ---------- */
    const callback_url = payment_status === "completed"
      ? `/application-success?registration_number=${registration_number}`
      : `/payment?registration_number=${registration_number}&amount=${total_amount}`;

    /* ---------- RESPONSE ---------- */
    return res.status(201).json({
      message: "Registration successful",
      registration_number,
      applications: applications.map(app => ({
        application_number: app.application_number,
        program_code: app.program_code,
        program_name: app.program_name
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

    // Handle MongoDB duplicate key errors
    const mongoError = err as MongoError;
    if (mongoError.code === 11000) {
      const field = mongoError.keyPattern ? Object.keys(mongoError.keyPattern)[0] : "unknown";
      const value = mongoError.keyValue ? Object.values(mongoError.keyValue)[0] : "unknown";
      return res.status(409).json({
        message: `Duplicate value for ${field}: ${value}. Please use different value.`
      });
    }

    // Handle Mongoose validation errors
    const validationError = err as ValidationError;
    if (validationError.name === "ValidationError") {
      const errors = Object.values(validationError.errors).map((e: { message: string }) => e.message);
      return res.status(400).json({
        message: "Validation failed",
        errors
      });
    }

    // Handle other errors
    const error = err as Error;
    return res.status(500).json({
      message: "Internal server error",
      ...(process.env.NODE_ENV === "development" && { error: error.message })
    });
  }
});

router.post("/department/login", async (req: Request<{}, {}, DepartmentLoginRequest>, res: Response): Promise<Response> => {
  try {
    const { college_email } = req.body;

    if (!college_email) {
      return res.status(400).json({ message: "College email is required" });
    }

    // Validate email format
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
          otp_expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        },
      }
    );

    await sendOtpMail(college_email, otp);

    return res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("Department login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});


router.post("/logout", (req: Request, res: Response): void => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      res.status(500).json({ message: "Error during logout" });
      return;
    }
    res.clearCookie("sid");
    res.json({ message: "Logged out successfully" });
  });
});

export default router;
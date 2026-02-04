import { Router } from "express";
import { signToken } from "../utils/jwt";
import candidateModel from "../models/candidate.model";
import programsModel from "../models/programs.model"; 
import { sendOtpMail } from "../utils/send_otp";
import StaffModel from "../models/staffmaster.heber.model";

const router = Router();

router.post("/login", async (req, res) => {
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
      registration_number,
      "personal_details.contact_info.mobile": mobile
    }).lean();

    if (!candidate) {
      return res.status(401).json({
        message: "Invalid registration number or mobile"
      });
    }

    /* ---------- USER PAYLOAD (FROM DB ONLY) ---------- */
    const user = {
      id: candidate._id.toString(),
      registration_number: candidate.registration_number,
      role: "candidate",
      payment_status: candidate.payment?.status || "PENDING"
    };

    /* ---------- JWT ---------- */
    const token = signToken(user);

    /* ---------- SESSION ---------- */
    req.session.user = user;

    /* ---------- RESPONSE ---------- */
    return res.json({
      message: "Login successful",
      token,
      user
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});


router.post("/signup", async (req, res) => {
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
                "UGBAENG",
                "UGBAECO"
              ]
            }
          }
        }

    */

    /* -----------PAYLOAD WITH NOT SC -----------
       {
         "personal_details": {
           "basic_info": {
             "name":  "karthi k"
             },
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
               "UGBAPOL"
             ]
           }
         }
       }


   */

    /* ---------- BASIC VALIDATION ---------- */
    if (
      !personal_details?.contact_info?.email ||
      !personal_details?.contact_info?.mobile
    ) {
      return res.status(400).json({
        message: "Email and mobile are required"
      });
    }

    /* ---------- COMMUNITY VALIDATION ---------- */
    const community =
      personal_details?.basic_info?.community;

    const communityNumber =
      personal_details?.basic_info?.community_number;

    const freeCommunities = ["SC", "ST", "SCA"];

    if (
      freeCommunities.includes(community) &&
      !communityNumber
    ) {
      return res.status(400).json({
        message: "Community number is mandatory for SC / ST / SCA"
      });
    }

    /* ---------- DUPLICATE CHECK (MOBILE ONLY) ---------- */
    const existing = await candidateModel.findOne({
      "personal_details.contact_info.mobile":
        personal_details.contact_info.mobile
    });

    if (existing) {
      return res.status(409).json({
        message: "Candidate already registered"
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

    /* ---------- APPLICATION NUMBER BASE ---------- */
    const lastApp = await candidateModel.aggregate([
      { $unwind: "$application_preferences.applications" },
      {
        $sort: {
          "application_preferences.applications.application_number": -1
        }
      },
      { $limit: 1 }
    ]);

    let nextApplicationNumber = 260001;
    if (lastApp.length > 0) {
      nextApplicationNumber =
        lastApp[0].application_preferences.applications.application_number + 1;
    }

    /* ---------- BUILD APPLICATIONS ---------- */
    const {
      program_code,
      application_type,
      application_count
    } = personal_details.application_info;

    const programs = await programsModel.find({
      program_code: { $in: program_code }
    }).lean();

    const programMap: Record<string, string> = {};

    programs.forEach((p: any) => {
      programMap[p.program_code] = p.program_name;
    });

    const applications = program_code.map((code: string) => ({
      application_number: nextApplicationNumber++,
      application_type,
      program_code: code,
      program_name: programMap[code] || ""
    }));

    /* ---------- APPLICATION AMOUNT ---------- */
    const isFreeCommunity =
      freeCommunities.includes(community);

    const perApplicationAmount = isFreeCommunity
      ? 0
      : application_type === "UG"
        ? 100
        : application_type === "PG"
          ? 160
          : 0;

    const total_amount =
      perApplicationAmount * application_count;

    const payment_status =
      total_amount === 0 ? "FREE" : "PENDING";

    /* ---------- CREATE CANDIDATE ---------- */
    const candidate = await candidateModel.create({
      registration_number,
      personal_details,
      payment: {
        amount: total_amount,
        status: payment_status
      },
      application_preferences: {
        applications
      }
    });

    const candidateId = candidate._id.toString();

    /* ---------- JWT ---------- */
    const token = signToken({
      id: candidateId,
      registration_number,
      role: "candidate"
    });

    /* ---------- SESSION ---------- */
    req.session.user = {
      id: candidateId,
      registration_number,
      role: "candidate"
    };

    /* ---------- CALLBACK URL ---------- */
    const callback_url =
      payment_status === "FREE"
        ? `/application-success?registration_number=${registration_number}`
        : `/payment?registration_number=${registration_number}&amount=${total_amount}`;

    /* ---------- RESPONSE ---------- */
    return res.status(201).json({
      message: "Registration successful",
      registration_number,
      applications,
      payment: {
        amount: total_amount,
        status: payment_status
      },
      token,
      callback_url
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});


router.post("/department/login", async (req, res) => {
  try {
    const { college_email } = req.body;

    if (!college_email) {
      return res.status(400).json({ message: "College email is required" });
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

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/department/verify-otp", async (req, res) => {
  try {
    const { college_email, otp } = req.body;

    if (!college_email || !otp) {
      return res.status(400).json({ message: "Email and OTP required" });
    }

    const staff = await StaffModel.findOne({
      college_email,
      otp,
      otp_expires_at: { $gt: new Date() },
    }).select(
      "staff_id name department_code department_name shift stream"
    );

    if (!staff) {
      return res.status(401).json({ message: "Invalid or expired OTP" });
    }

    await StaffModel.updateOne(
      { college_email },
      { $unset: { otp: "", otp_expires_at: "" } }
    );

    res.json({
      message: "Login successful",
      staff,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ message: "Logged out successfully" });
  });
});

export default router;

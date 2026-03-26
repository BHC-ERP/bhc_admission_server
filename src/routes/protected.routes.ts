import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { candidateSignup } from "../controllers/auth/auth.controller";
import { SignupRequest } from "../services/candidate.service";
import CandidateAdmission from "../models/candidate.model";

const router = Router();

router.get("/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: "Welcome to dashboard",
    user: req.user,
  });
});

router.post('/missed_save', async (req, res) => {
  try {
    const {
      candidateDetails,
      amount,
      transaction_id,
      payment_date,
      bank_ref_no,
      
    } = req.body;

    const mobile = candidateDetails?.personal_details?.contact_info?.mobile;

    if (!mobile) {
      return res.status(400).json({ message: "Mobile number required" });
    }

    // 🔍 Check existing (IMPORTANT: use correct field)
    let existing = await CandidateAdmission.findOne({
      "personal_details.phone": mobile
    });

    // =============================
    // ✅ EXISTING → UPDATE PAYMENT
    // =============================
    if (existing) {
 
      return res.json({
        status: "Already Existing",
        registration_number: existing.registration_number
      });
    }

    // =============================
    // 🆕 NEW → USE candidateSignup
    // =============================

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
        payment_method: 'ccavenue_missed',
        amount_paid: amount,
        status: "success",
        transaction_id,
        transaction_date: payment_date || new Date(),
        bank_ref_no,
      }
    };

    // 🔥 CALL YOUR EXISTING LOGIC
    const signupReq = {
      ...req,
      body: transformedBody
    };

    return await candidateSignup(signupReq as any, res);

  } catch (err) {
    console.error("Missed save error:", err);
    res.status(500).json({ message: "Error handling missed payment" });
  }
});

export default router;

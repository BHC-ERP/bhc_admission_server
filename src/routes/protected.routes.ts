import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { candidateSignup } from "../controllers/auth/auth.controller";
import { SignupRequest, addMoreCandidateCoursesService } from "../services/candidate.service";
import CandidateAdmission from "../models/candidate.model";
import { createPaymentAuditLog } from "../services/auditlog.service";
import mongoose from "mongoose";

const router = Router();

router.get("/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: "Welcome to dashboard",
    user: req.user,
  });
});

router.post('/missed_save', async (req, res) => {
  // Declare variables outside 'try' so they are accessible in 'finally'
  let mobile: string | undefined;
  let transactionId: string | undefined;
  let staffid: string | undefined;
  let orderId: string | undefined;
  try {
    const {
      candidateDetails,
      amount,
      transaction_id,
      payment_date,
      bank_ref_no,
      staff_id,
      order_id
    } = req.body;

    mobile = candidateDetails?.personal_details?.contact_info?.mobile;
    transactionId = transaction_id;
    staffid = staff_id;
    orderId = order_id;

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
    await createPaymentAuditLog({
      personal_details: candidateDetails || {},
      selected_courses: candidateDetails?.selected_courses || [],
      payment_details: {
        ...(candidateDetails?.payment_details || {}),
        payment_method: "ccavenue_missed",
        amount_paid: amount ? parseFloat(amount) : 0,
        status: "Success",
        transaction_id: transaction_id,
        bank_ref_no: bank_ref_no || null,
        transaction_date: payment_date || new Date().toISOString()
      },
      step_completed: candidateDetails?.step_completed
    });


    return await candidateSignup(signupReq as any, res);

  } catch (err) {
    console.error("Missed save error:", err);
    res.status(500).json({ message: "Error handling missed payment" });
  } finally {
    // Check if the user ultimately exists (either already existed or was just created)
    if (mobile && transactionId && orderId) {
      let existing = await CandidateAdmission.findOne({
        "personal_details.phone": mobile
      });

      if (existing) {
        const auditLog = await mongoose.connection.collection('payment_audit_logs').findOne({ transaction_id: transactionId });
        if (auditLog) {
          await mongoose.connection.collection('missed_delete').insertOne({
            ...auditLog,
            status: "Resolved",
            staff_id: staffid,
            moved_at: new Date()
          });
          await mongoose.connection.collection('payment_initiated').deleteOne({ order_id: orderId });
        }
      }
    }
  }
});


router.post('/missed_Add_more_courses', async (req, res) => {
  let mobile: string | undefined;
  let transactionId: string | undefined;
  let staffid: string | undefined;
  try {
    const {
      candidateDetails,
      amount,
      transaction_id,
      payment_date,
      bank_ref_no,
      staff_id
    } = req.body;

    mobile = candidateDetails?.personal_details?.contact_info?.mobile;
    transactionId = transaction_id;
    staffid = staff_id;

    if (!mobile) {
      return res.status(400).json({ message: "Mobile number required" });
    }

    // 🔍 Check existing (For add more courses, candidate MUST exist)
    let existing = await CandidateAdmission.findOne({
      "personal_details.phone": mobile
    });

    if (!existing) {
      return res.status(404).json({ message: "Candidate not found. Cannot add more courses." });
    }

    const selected_courses = candidateDetails?.selected_courses || req.body.selected_courses;

    if (!selected_courses || !selected_courses.length) {
      return res.status(400).json({ message: "No courses selected to add" });
    }

    // 🔥 CALL EXISTING ADD MORE COURSES LOGIC
    const result = await addMoreCandidateCoursesService(
      existing._id.toString(),
      selected_courses,
      {
        amount_paid: amount ? parseFloat(amount) : 0,
        transaction_id: transaction_id,
        transaction_date: payment_date || new Date().toISOString(),
        payment_method: "ccavenue_missed"
      }
    );

    // ✅ SAVE AUDIT LOG
    await createPaymentAuditLog({
      personal_details: candidateDetails || {},
      selected_courses: selected_courses,
      payment_details: {
        ...(candidateDetails?.payment_details || {}),
        payment_method: "ccavenue_missed",
        amount_paid: amount ? parseFloat(amount) : 0,
        status: "Success",
        transaction_id: transaction_id,
        bank_ref_no: bank_ref_no || null,
        transaction_date: payment_date || new Date().toISOString(),
        is_add_more: true
      },
      step_completed: candidateDetails?.step_completed,
    });

    return res.status(200).json({
      status: "success",
      message: "Additional courses added successfully via missed save recovery",
      data: result
    });

  } catch (err: any) {
    console.error("Missed Add More Courses error:", err);
    res.status(500).json({
      message: "Error handling missed add more courses",
      error: err.message
    });
  } finally {
    if (mobile && transactionId) {
      let existing = await CandidateAdmission.findOne({
        "personal_details.phone": mobile
      });

      if (existing) {
        const auditLog = await mongoose.connection.collection('payment_audit_logs').findOne({ transaction_id: transactionId });
        if (auditLog) {
          await mongoose.connection.collection('missed_delete').insertOne({
            ...auditLog,
            status: "Resolved",
            staff_id: staffid,
            moved_at: new Date()
          });
          await mongoose.connection.collection('payment_audit_logs').deleteOne({ _id: auditLog._id });
        }
      }
    }
  }
});

// Move to unsuccessful_payment collection
router.post('/unsuccessful_payment', async (req, res) => {
  try {
    const { order_id, reason, staff_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ message: "order_id is required" });
    }

    const auditLog = await mongoose.connection.collection('payment_initiated').findOne({ orderId: order_id });

    if (!auditLog) {
      return res.status(404).json({ message: "Transaction not found in payment initiated logs" });
    }

    await mongoose.connection.collection('unsuccessful_payment').insertOne({
      ...auditLog,
      status: "Unsuccessful",
      reason: reason || "Marked as unsuccessful by admin",
      staff_id: staff_id,
      moved_at: new Date()
    });

    await mongoose.connection.collection('payment_initiated').deleteOne({ _id: auditLog._id });

    return res.status(200).json({
      status: "success",
      message: "Transaction moved to unsuccessful_payment collection"
    });
  } catch (err: any) {
    console.error("Unsuccessful payment route error:", err);
    res.status(500).json({ message: "Error processing unsuccessful payment", error: err.message });
  }
});

// Move to refund collection
router.post('/refund_payment', async (req, res) => {
  try {
    const { order_id, reason, refund_amount, staff_id, ccavenue_ref, bank_ref_no } = req.body;
    if (!order_id) {
      return res.status(400).json({ message: "order_id is required" });
    }

    const auditLog = await mongoose.connection.collection('payment_initiated').findOne({ orderId: order_id });

    if (!auditLog) {
      return res.status(404).json({ message: "Transaction not found in payment initiated logs" });
    }

    await mongoose.connection.collection('refund_payments').insertOne({
      ...auditLog,
      status: "refund_initiated",
      ccavenue_ref: ccavenue_ref,
      bank_ref_no: bank_ref_no,
      refund_amount: refund_amount || auditLog.payment_details?.amount_paid || 0,
      staff_id: staff_id,
      reason: reason || "Marked for refund by admin",
      moved_at: new Date()
    });

    await mongoose.connection.collection('payment_initiated').deleteOne({ _id: auditLog._id });

    return res.status(200).json({
      status: "success",
      message: "Transaction moved to refund collection"
    });
  } catch (err: any) {
    console.error("Refund route error:", err);
    res.status(500).json({ message: "Error processing refund", error: err.message });
  }
});

export default router;

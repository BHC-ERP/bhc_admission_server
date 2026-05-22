import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { candidateSignup } from "../controllers/auth/auth.controller";
import { addMoreCandidateCoursesService } from "../services/candidate.service";
import CandidateAdmission from "../models/candidate.model";
import { createPaymentAuditLog } from "../services/auditlog.service";
import mongoose from "mongoose";

const router = Router();

router.get("/dashboard", authMiddleware, (req: any, res) => {
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
    const aadhar = candidateDetails?.personal_details?.basic_info?.aadhar_number;
    let existing = await CandidateAdmission.findOne({
      $or: [
        { "personal_details.phone": mobile },
        { "personal_details.aadharNumber": aadhar }
      ]
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
    if (mobile) {
      // Find the associated pending payment by mobile or exact orderId if provided as transaction_id
      const pendingReq = await mongoose.connection.collection('payment_initiated').findOne({
        $or: [
          { orderId: transactionId },
          { "candidateDetails.personal_details.contact_info.mobile": mobile }
        ]
      });

      if (pendingReq) {
        const { _id, ...insertData } = pendingReq;
        // Ensure idempotency for missed_delete insert
        const alreadyMoved = await mongoose.connection.collection('missed_delete').findOne({ orderId: pendingReq.orderId });
        if (!alreadyMoved) {
          await mongoose.connection.collection('missed_delete').insertOne({
            ...insertData,
            status: "Resolved",
            staff_id: staffid,
            moved_at: new Date()
          });
        }
        await mongoose.connection.collection('payment_initiated').deleteOne({ _id: pendingReq._id });
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
    if (mobile) {
      // Find the associated pending payment by mobile or exact orderId if provided as transaction_id
      const pendingReq = await mongoose.connection.collection('payment_initiated').findOne({
        $or: [
          { orderId: transactionId },
          { "candidateDetails.personal_details.contact_info.mobile": mobile }
        ]
      });

      if (pendingReq) {
        const { _id, ...insertData } = pendingReq;
        // Ensure idempotency for missed_delete insert
        const alreadyMoved = await mongoose.connection.collection('missed_delete').findOne({ orderId: pendingReq.orderId });
        if (!alreadyMoved) {
          await mongoose.connection.collection('missed_delete').insertOne({
            ...insertData,
            status: "Resolved",
            staff_id: staffid,
            moved_at: new Date()
          });
        }
        await mongoose.connection.collection('payment_initiated').deleteOne({ _id: pendingReq._id });
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

router.get('/unsuccessful_payments', async (req, res) => {
  try {
    const data = await mongoose.connection.collection('unsuccessful_payment')
      .find({})
      .sort({ moved_at: -1 })
      .toArray();
    return res.status(200).json({ status: "success", data });
  } catch (err: any) {
    console.error("Get unsuccessful payments error:", err);
    res.status(500).json({ message: "Error fetching unsuccessful payments", error: err.message });
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

    await mongoose.connection.useDb('fee_collection').collection('refund_initiate').insertOne({
      ...auditLog,
      status: "refund_initiated",
      tracking_id: ccavenue_ref, // mapping for consistency
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

router.get('/refund_payments', async (req, res) => {
  try {
    const data = await mongoose.connection.useDb('fee_collection').collection('refund_initiate')
      .find({})
      .sort({ moved_at: -1, createdAt: -1 })
      .toArray();

    return res.status(200).json({ status: "success", data });
  } catch (err: any) {
    console.error("Get refund payments error:", err);
    res.status(500).json({ message: "Error fetching refund payments", error: err.message });
  }
});

// Bulk reconcile route
router.post('/bulk_reconcile', async (req, res) => {
  try {
    const { batch, staff_id } = req.body; // batch: { orderId, isShipped, isAddMore, transactionId, paymentDate, bankRefNo, status, actualStatus, candidateDetails, amount }[]

    if (!batch || !Array.isArray(batch)) {
      return res.status(400).json({ message: "Batch array is required" });
    }

    const results = {
      success: 0,
      failed: 0,
      details: [] as any[]
    };

    for (const item of batch) {
      const { orderId, isShipped, isAddMore, candidateDetails, amount, transactionId, paymentDate, bankRefNo, actualStatus } = item;

      try {
        // Skip if status is 'Not Found in Excel' or 'Awaited'
        if (actualStatus === 'Not Found in Excel' || actualStatus === 'Awaited') {
          results.details.push({ orderId, status: "Skipped", message: `Status is ${actualStatus}` });
          continue;
        }

        if (isShipped) {
          // Logic from missed_save or missed_Add_more_courses
          const mobile = candidateDetails?.personal_details?.contact_info?.mobile;
          if (!mobile) throw new Error("Mobile required");

          let existing = await CandidateAdmission.findOne({ "personal_details.phone": mobile });

          if (isAddMore) {
            if (!existing) throw new Error("Candidate not found for Add More");

            const selected_courses = candidateDetails?.selected_courses;
            await addMoreCandidateCoursesService(existing._id.toString(), selected_courses, {
              amount_paid: amount ? parseFloat(amount) : 0,
              transaction_id: transactionId,
              transaction_date: paymentDate || new Date().toISOString(),
              payment_method: "ccavenue_missed"
            });

            await createPaymentAuditLog({
              personal_details: candidateDetails,
              selected_courses,
              payment_details: {
                payment_method: "ccavenue_missed",
                amount_paid: amount ? parseFloat(amount) : 0,
                status: "Success",
                transaction_id: transactionId,
                bank_ref_no: bankRefNo || null,
                transaction_date: paymentDate || new Date().toISOString(),
                is_add_more: true
              },
              step_completed: candidateDetails?.step_completed
            });
          } else {
            if (existing) {
              // 🔍 Candidate exists, check if THIS specific order was also successful (Double Payment)
              const ccCollection = mongoose.connection.useDb('ccavenue_payment').collection('ccavenue_admissions');
              const currentTx = await ccCollection.findOne({
                "data.order_id": orderId,
                "data.order_status": "Success"
              });

              if (currentTx) {
                const pending = await mongoose.connection.collection('payment_initiated').findOne({ orderId });
                if (pending) {
                  const { _id, ...insertData } = pending;
                  await mongoose.connection.useDb('fee_collection').collection('refund_initiate').insertOne({
                    ...insertData,
                    status: "refund_initiated",
                    tracking_id: currentTx.data.tracking_id,
                    bank_ref_no: currentTx.data.bank_ref_no,
                    refund_amount: currentTx.data.amount || pending.amount || 0,
                    staff_id: staff_id,
                    reason: `${currentTx.data.tracking_id}- ccavenue ref no order successfull status - ${currentTx.data.order_status} (Already Registered - Refund Needed)`,
                    moved_at: new Date()
                  });
                  await mongoose.connection.collection('payment_initiated').deleteOne({ _id: pending._id });
                  results.success++;
                  results.details.push({ orderId, status: "Moved to Refund", message: "Already Existing - Extra Success Payment" });
                }
              } else {
                // If not successful, just clear it from initiated
                await mongoose.connection.collection('payment_initiated').deleteOne({ orderId });
                results.details.push({ orderId, status: "Skipped", message: "Already Existing - No action needed" });
              }
              continue;
            }

            const applicationInfo = candidateDetails.personal_details.application_info;
            const transformedBody = {
              personal_details: {
                ...candidateDetails.personal_details,
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
                transaction_id: transactionId,
                transaction_date: paymentDate || new Date(),
                bank_ref_no: bankRefNo,
              }
            };

            await createPaymentAuditLog({
              personal_details: candidateDetails,
              selected_courses: candidateDetails?.selected_courses || [],
              payment_details: {
                payment_method: "ccavenue_missed",
                amount_paid: amount ? parseFloat(amount) : 0,
                status: "Success",
                transaction_id: transactionId,
                bank_ref_no: bankRefNo || null,
                transaction_date: paymentDate || new Date().toISOString()
              },
              step_completed: candidateDetails?.step_completed
            });

            // 🔥 CALL candidateSignup LOGIC properly for batch
            const signupReq = { ...req, body: transformedBody } as any;
            const signupRes = {
              _statusCode: 200,
              status: function (code: number) { this._statusCode = code; return this; },
              json: function (data: any) { this.data = data; return this; },
              data: null as any
            } as any;

            console.log(`[Bulk Reconcile] Registering candidate for Order: ${orderId}, Phone: ${mobile}`);
            await candidateSignup(signupReq, signupRes);
            console.log(`[Bulk Reconcile] Result for Order ${orderId}: Status ${signupRes._statusCode}, Data:`, signupRes.data);

            if (signupRes._statusCode >= 400) {
              throw new Error(signupRes.data?.message || `Candidate creation failed with status ${signupRes._statusCode}`);
            }
          }

          // ✅ SECURE CLEANUP AND DUPLICATE HANDLING
          const allPendingForUser = await mongoose.connection.collection('payment_initiated').find({
            "candidateDetails.personal_details.contact_info.mobile": candidateDetails?.personal_details?.contact_info?.mobile
          }).toArray();

          for (const pending of allPendingForUser) {
            const { _id, ...insertData } = pending;

            if (pending.orderId === orderId) {
              // 1. Current successfully reconciled orderId -> missed_delete
              const alreadyMoved = await mongoose.connection.collection('missed_delete').findOne({ orderId: pending.orderId });
              if (!alreadyMoved) {
                await mongoose.connection.collection('missed_delete').insertOne({
                  ...insertData,
                  status: "Resolved",
                  staff_id: staff_id,
                  moved_at: new Date()
                });
              }
            } else {
              // 2. Extra duplicate orders -> check if they were also successful ('Shipped' or 'Successfull')
              const ccCollection = mongoose.connection.useDb('ccavenue_payment').collection('ccavenue_admissions');
              const extraTx = await ccCollection.findOne({
                "data.order_id": pending.orderId,
                "data.order_status": "Success"
              });

              if (extraTx) {
                // Duplicate SUCCESSFUL payment -> refund_initiate
                await mongoose.connection.useDb('fee_collection').collection('refund_initiate').insertOne({
                  ...insertData,
                  status: "refund_initiated",
                  tracking_id: extraTx.data.tracking_id,
                  bank_ref_no: extraTx.data.bank_ref_no,
                  refund_amount: extraTx.data.amount || pending.amount || 0,
                  staff_id: staff_id,
                  reason: `${extraTx.data.tracking_id}- ccavenue ref no order successfull status - ${extraTx.data.order_status} (Duplicate)`,
                  moved_at: new Date()
                });
              } else {
                // Duplicate UNSUCCESSFUL attempt -> missed_delete
                await mongoose.connection.collection('missed_delete').insertOne({
                  ...insertData,
                  status: "Resolved",
                  reason: "Duplicate session cleared",
                  staff_id: staff_id,
                  moved_at: new Date()
                });
              }
            }
            // Delete from initiated after moving to appropriate collection
            await mongoose.connection.collection('payment_initiated').deleteOne({ _id: pending._id });
          }

          results.success++;
          results.details.push({ orderId, status: "Success" });
        } else {
          // Move to unsuccessful_payment
          const auditLog = await mongoose.connection.collection('payment_initiated').findOne({ orderId });
          if (auditLog) {
            await mongoose.connection.collection('unsuccessful_payment').insertOne({
              ...auditLog,
              status: "Unsuccessful",
              reason: `Excel Status - ${actualStatus || 'Dropped'}: Order not successful`,
              staff_id: staff_id,
              moved_at: new Date()
            });
            await mongoose.connection.collection('payment_initiated').deleteOne({ _id: auditLog._id });
            results.success++;
            results.details.push({ orderId, status: "Moved to Unsuccessful" });
          } else {
            results.failed++;
            results.details.push({ orderId, status: "Failed", message: "Not found in initiated" });
          }
        }
      } catch (err: any) {
        results.failed++;
        results.details.push({ orderId, status: "Error", message: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      summary: results
    });

  } catch (err: any) {
    console.error("Bulk reconcile error:", err);
    res.status(500).json({ message: "Bulk reconciliation failed", error: err.message });
  }
});

router.post('/upload_ccavenue_data', async (req, res) => {
  try {
    const payload = req.body;
    // Assuming the payload can be a single object or an array of objects
    const items = Array.isArray(payload) ? payload : [payload];

    const transformedData = items.map((item: any) => {
      // Helper to format date backward to "DD/MM/YYYY HH:mm:ss"
      const formatTransDate = (dateStr: any) => {
        if (!dateStr) return "";
        let d;
        if (typeof dateStr === 'object' && dateStr.$date) d = new Date(dateStr.$date);
        else d = new Date(dateStr);
        if (isNaN(d.getTime())) return "";
        const pad = (n: number) => n < 10 ? '0' + n : n.toString();
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      };

      return {
        source: "ccavenue/admission",
        data: {
          order_id: item.orderNo || "",
          tracking_id: item.ccavenueRef || "",
          bank_ref_no: item.orderBankRefNo || "",
          order_status: item.orderStatus || "",
          failure_message: item.orderBankResponse === "Transaction aborted by system." ? "" : "",
          payment_mode: item.paymentMode || "",
          card_name: item.cardName || "",
          status_code: "null",
          status_message: item.orderBankResponse || "",
          currency: item.currency || "INR",
          amount: item.orderAmount != null ? Number(item.orderAmount).toFixed(2) : "0.00",
          billing_name: item.billName || "",
          billing_address: item.billAddress || "",
          billing_city: item.billCity || "",
          billing_state: item.billState || "",
          billing_zip: item.billZip || "",
          billing_country: item.billCountry || "",
          billing_tel: item.billTel || "",
          billing_email: item.billEmail || "",
          delivery_name: item.shipName || "",
          delivery_address: item.shipAddress || "",
          delivery_city: item.shipCity || "",
          delivery_state: item.shipState || "",
          delivery_zip: item.shipZip || "",
          delivery_country: item.shipCountry || "",
          delivery_tel: item.shipTel || "",
          merchant_param1: item.merchantParam1 || "",
          merchant_param2: item.merchantParam2 || "",
          merchant_param3: item.merchantParam3 || "",
          merchant_param4: item.merchantParam4 || "",
          merchant_param5: item.merchantParam5 || "",
          vault: item.isCorp || "N",
          offer_type: "null",
          offer_code: "null",
          discount_value: item.discount != null ? Number(item.discount).toFixed(1) : "0.0",
          mer_amount: item.grossAmount != null ? Number(item.grossAmount).toFixed(2) : "0.00",
          eci_value: "null",
          retry: "N",
          response_code: "",
          billing_notes: "",
          trans_date: formatTransDate(item.orderDatetime),
          bin_country: item.orderBinCountry || "",
          auth_ref_num: item.orderBankArnNo || "",
          trans_fee: "0.0",
          service_tax: item.tax != null ? Number(item.tax).toFixed(1) : "0.0"
        },
        metadata: {
          ip: item.customerIP || "",
          method: "POST",
          userAgent: "okhttp/3.5.0"
        },
        receivedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0
      };
    });

    const ccCollection = mongoose.connection.useDb('ccavenue_payment').collection('ccavenue_admissions');

    const operations = transformedData.map((doc: any) => ({
      updateOne: {
        filter: { "data.order_id": doc.data.order_id },
        update: { $set: doc },
        upsert: true
      }
    }));

    if (operations.length > 0) {
      await ccCollection.bulkWrite(operations);
    }

    res.status(200).json({
      success: true,
      message: `Successfully processed and uploaded ${items.length} records to ccavenue_admissions.`,
      data: transformedData
    });

  } catch (error: any) {
    console.error("Error processing CCAvenue data upload:", error);
    res.status(500).json({ success: false, message: "Error processing upload", error: error.message });
  }
});

export default router;

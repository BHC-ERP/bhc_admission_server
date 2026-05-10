import { Request, Response } from "express";
import SmsTemplate from "../models/smsTemplate.model";
import { sendSMSService } from "../services/sms.service";
import CandidateAdmission from "../models/candidate.model";
import mongoose from "mongoose";

export const getSmsTemplates = async (req: Request, res: Response) => {
    try {
        const templates = await SmsTemplate.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: templates });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createSmsTemplate = async (req: Request, res: Response) => {
    try {
        const { identifier, title, message, fields } = req.body;
        const newTemplate = new SmsTemplate({ identifier, title, message, fields });
        await newTemplate.save();
        res.status(201).json({ success: true, data: newTemplate });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateSmsTemplate = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updatedTemplate = await SmsTemplate.findByIdAndUpdate(id, req.body, { new: true });
        res.status(200).json({ success: true, data: updatedTemplate });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteSmsTemplate = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await SmsTemplate.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Template deleted successfully" });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const sendSms = async (req: Request, res: Response) => {
    try {
        const {
            mobile,
            template_identifier,
            dynamic_values,
            candidate_id,
            application_number,
            stream,
            shift,
            user // Details of the staff sending the SMS
        } = req.body;

        if (!mobile || !template_identifier || !dynamic_values) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // Get Template from DB
        const template = await SmsTemplate.findOne({ identifier: template_identifier });
        if (!template) {
            return res.status(404).json({ success: false, message: "Template not found" });
        }

        // Replace Variables sequence-wise
        let msg = template.message;
        if (Array.isArray(dynamic_values)) {
            dynamic_values.forEach((value: any) => {
                msg = msg.replace('{#var#}', value);
            });
        }

        // Update payment enablement in candidate_fees_master
        if (application_number) {
            const db = mongoose.connection.useDb('admission2026');
            const isPaymentEnabled = (template_identifier === 'admission_spot' || template_identifier === "fee_sms");

            const updateFields: any = { is_payment_enabled: isPaymentEnabled };

            if (isPaymentEnabled) {
                const expiryDate = new Date();
                // Add 2 days to current date
                expiryDate.setDate(expiryDate.getDate() + 2);
                updateFields.payment_expiry_date = expiryDate;
            }

            await db.collection('candidate_fees_master').updateOne(
                { application_number: Number(application_number) },
                { $set: updateFields }
            );

            console.log(`[SMS] Payment ${isPaymentEnabled ? 'ENABLED' : 'DISABLED'} for app ${application_number} (Template: ${template_identifier})`);
        }

        // Send SMS using service
        await sendSMSService(mobile, msg);



        // Update Candidate Model if IDs provided
        if (candidate_id && application_number) {
            let interview_date: Date | null = null;
            let last_date: Date | null = null;

            // Map dates from dynamic values based on template fields
            if (template.fields && Array.isArray(dynamic_values)) {
                template.fields.forEach((field, index) => {
                    const value = dynamic_values[index];
                    if (!value) return;

                    if (field.toLowerCase().includes("interview date")) {
                        const parsedDate = new Date(value);
                        if (!isNaN(parsedDate.getTime())) interview_date = parsedDate;
                    } else if (field.toLowerCase().includes("last date")) {
                        const parsedDate = new Date(value);
                        if (!isNaN(parsedDate.getTime())) last_date = parsedDate;
                    }
                });
            }

            const smsLog = {
                sent_by: {
                    staff_id: user?.staff_id,
                    staff_name: user?.staff_name,
                    department: user?.department,
                    designation: user?.designation
                },
                sent_at: new Date(),
                template_identifier,
                dynamic_values,
                interview_date,
                last_date,
                message: msg
            };

            await CandidateAdmission.findOneAndUpdate(
                {
                    _id: candidate_id,
                    "application_preferences.applications.application_number": application_number
                },
                {
                    $push: {
                        "application_preferences.applications.$.sms_history": smsLog,
                        "admission_status.status_history": {
                            status: "SMS_SENT",
                            changed_at: new Date(),
                            remarks: `SMS dispatched: ${template.title}`
                        }
                    },
                    $set: {
                        "admission_status.current": "SMS_SENT",
                        "application_preferences.applications.$.status": "SMS_SENT",
                        ...(stream && { "application_preferences.applications.$.stream": stream }),
                        ...(shift && { "application_preferences.applications.$.shift": shift })
                    }
                }
            );
        }

        res.status(200).json({
            success: true,
            message: "✅ SMS SENT SUCCESSFULLY",
            generated_message: msg
        });

    } catch (error: any) {
        console.error("❌ Failed to Send SMS:", error.message);
        res.status(500).json({
            success: false,
            message: "❌ Failed to Send SMS",
            error: error.message
        });
    }
};

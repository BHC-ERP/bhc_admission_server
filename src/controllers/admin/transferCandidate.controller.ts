import { Request, Response } from "express";
import mongoose from "mongoose";
import CandidateAdmission from "../../models/candidate.model";

/**
 * SHIFT TRANSFER
 * Updates the shift for a specific application in both candidateadmissions and candidate_fees_master
 */
export const shiftTransfer = async (req: Request, res: Response) => {
    try {
        const { application_number, new_shift } = req.body;

        if (!application_number || !new_shift) {
            return res.status(400).json({ success: false, message: "application_number and new_shift are required" });
        }

        const appNo = Number(application_number);

        // 1. Fetch candidate to provide specific validation feedback
        const candidate = await CandidateAdmission.findOne({
            "application_preferences.applications.application_number": appNo
        });

        if (!candidate) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        const app = candidate.application_preferences?.applications?.find(a => a.application_number === appNo);
        if (!app) {
            return res.status(404).json({ success: false, message: "Application record not found in candidate preferences" });
        }

        if (String(app.status) === "ADMITTED") {
            return res.status(400).json({ success: false, message: "Cannot transfer shift: Candidate is already ADMITTED" });
        }

        if (app.stream !== "Self-Finance") {
            return res.status(400).json({ success: false, message: "Shift transfer is only allowed for Self-Finance applications (Aided is always Shift-1)" });
        }

        // 2. Update CandidateAdmission (Mongoose Model)
        const candidateUpdate = await CandidateAdmission.updateOne(
            { "application_preferences.applications.application_number": appNo },
            { $set: { "application_preferences.applications.$.shift": new_shift } }
        );

        // 2. Update candidate_fees_master (Only if it exists)
        const admissionDb = mongoose.connection.useDb('admission2026');
        const candidateFeesMaster = admissionDb.collection('candidate_fees_master');

        await candidateFeesMaster.updateOne(
            { application_number: appNo },
            { $set: { shift: new_shift, updatedAt: new Date() } }
        );

        return res.json({
            success: true,
            message: `Shift successfully updated to ${new_shift} for application ${application_number}`
        });

    } catch (error: any) {
        console.error("shiftTransfer error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

/**
 * STREAM TRANSFER
 * Updates the stream (e.g., Aided/Self-Finance) for a specific application
 */
export const streamTransfer = async (req: Request, res: Response) => {
    try {
        const { application_number, new_stream, new_shift } = req.body;

        if (!application_number || !new_stream) {
            return res.status(400).json({ success: false, message: "application_number and new_stream are required" });
        }

        const appNo = Number(application_number);

        // 1. Fetch candidate to provide specific validation feedback
        const candidate = await CandidateAdmission.findOne({
            "application_preferences.applications.application_number": appNo
        });

        if (!candidate) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        const app = candidate.application_preferences?.applications?.find(a => a.application_number === appNo);
        if (!app) {
            return res.status(404).json({ success: false, message: "Application record not found" });
        }

        if (String(app.status) === "ADMITTED") {
            return res.status(400).json({ success: false, message: "Cannot transfer stream: Candidate is already ADMITTED" });
        }

        // 2. Validate and Assign Shift based on Stream
        let assignedShift = new_shift;
        if (new_stream === "Aided") {
            assignedShift = "Shift-1";
        } else if (new_stream === "Self-Finance") {
            if (!assignedShift || (assignedShift !== "Shift-1" && assignedShift !== "Shift-2")) {
                assignedShift = "Shift-1";
            }
        }

        // 3. Check candidate_fees_master status (Gatekeeper)
        const admissionDb = mongoose.connection.useDb('admission2026');
        const candidateFeesMaster = admissionDb.collection('candidate_fees_master');

        const feeRecord = await candidateFeesMaster.findOne({ application_number: appNo });
        if (feeRecord && feeRecord.status !== 'PENDING') {
            return res.status(403).json({
                success: false,
                message: `Cannot transfer stream: Payment status is ${feeRecord.status}. Stream can only be changed if payment is PENDING.`
            });
        }

        // 4. Update CandidateAdmission
        const candidateUpdate = await CandidateAdmission.updateOne(
            { "application_preferences.applications.application_number": appNo },
            {
                $set: {
                    "application_preferences.applications.$.stream": new_stream,
                    "application_preferences.applications.$.shift": assignedShift
                }
            }
        );

        // 4. Delete the fee record ONLY if it is in PENDING status
        // (If we reached here, status is confirmed PENDING or record is missing)
        if (feeRecord && feeRecord.status === 'PENDING') {
            await candidateFeesMaster.deleteOne({ application_number: appNo });
        }

        return res.json({
            success: true,
            message: `Stream successfully updated to ${new_stream} (${assignedShift}). Fee record handled.`
        });

    } catch (error: any) {
        console.error("streamTransfer error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * COURSE TRANSFER
 * Updates the course/program details for a specific application
 */
export const courseTransfer = async (req: Request, res: Response) => {
    try {
        const {
            application_number,
            new_program_code,
            new_program_name,
            new_stream,
            new_shift
        } = req.body;

        if (!application_number || !new_program_code || !new_program_name) {
            return res.status(400).json({
                success: false,
                message: "application_number, new_program_code, and new_program_name are required"
            });
        }

        const appNo = Number(application_number);

        // 1. Fetch candidate to provide specific validation feedback
        const candidate = await CandidateAdmission.findOne({
            "application_preferences.applications.application_number": appNo
        });

        if (!candidate) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        const app = candidate.application_preferences?.applications?.find(a => a.application_number === appNo);
        if (!app) {
            return res.status(404).json({ success: false, message: "Application record not found" });
        }

        if (String(app.status) === "ADMITTED") {
            return res.status(400).json({ success: false, message: "Cannot transfer course: Candidate is already ADMITTED" });
        }

        // 2. Update CandidateAdmission
        // We update the program details
        const updateObj: any = {
            "application_preferences.applications.$.program_code": new_program_code,
            "application_preferences.applications.$.program_name": new_program_name,
        };
        if (new_stream) updateObj["application_preferences.applications.$.stream"] = new_stream;
        if (new_shift) updateObj["application_preferences.applications.$.shift"] = new_shift;

        const candidateUpdate = await CandidateAdmission.updateOne(
            { "application_preferences.applications.application_number": appNo },
            { $set: updateObj }
        );

        // 2. Reset 'is_other_application' to false if it was true in any 'selected' entries
        await CandidateAdmission.updateOne(
            { "application_preferences.applications.application_number": appNo },
            {
                $set: { "application_preferences.applications.$[app].selected.$[sel].is_other_application": false }
            },
            {
                arrayFilters: [
                    { "app.application_number": appNo },
                    { "sel.is_other_application": true }
                ]
            }
        );

        // 3. candidate_fees_master logic: 
        // Find record and DELETE ONLY if status is PENDING.
        const admissionDb = mongoose.connection.useDb('admission2026');
        const candidateFeesMaster = admissionDb.collection('candidate_fees_master');

        const feeRecord = await candidateFeesMaster.findOne({ application_number: appNo });
        if (feeRecord && feeRecord.status === 'PENDING') {
            await candidateFeesMaster.deleteOne({ application_number: appNo });
        }

        return res.json({
            success: true,
            message: `Course successfully updated to ${new_program_name} and related records synced.`
        });

    } catch (error: any) {
        console.error("courseTransfer error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
/**
 * GET APPLICATION DETAILS
 * Fetches current application state for the transfer modal
 */
export const getApplicationDetails = async (req: Request, res: Response) => {
    try {
        const { appNo } = req.params;
        const applicationNumber = Number(appNo);

        if (isNaN(applicationNumber)) {
            return res.status(400).json({ success: false, message: "Invalid application number" });
        }

        // 1. Find candidate and the specific application
        const candidate = await CandidateAdmission.findOne({
            "application_preferences.applications.application_number": applicationNumber
        });

        if (!candidate) {
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        const app = candidate.application_preferences?.applications?.find(
            a => a.application_number === applicationNumber
        );

        if (!app) {
            return res.status(404).json({ success: false, message: "Specific application data not found" });
        }

        // Determine current shift: check main app record first, then the latest selection entry
        let currentShift: string = app.shift || "";
        if (!currentShift && app.selected && app.selected.length > 0) {
            // Get the shift from the latest selection entry
            const latestSelection = app.selected[app.selected.length - 1];
            currentShift = latestSelection.selected_by?.shift || latestSelection.selected_by?.selected_stream?.split(' ')[1] || "";
        }

        // If it's Aided and still no shift, default to Shift-1
        if (!currentShift && app.stream === 'Aided') {
            currentShift = 'Shift-1';
        }

        // Normalize shift labels
        if (currentShift === '1') currentShift = 'Shift-1';
        if (currentShift === '2') currentShift = 'Shift-2';

        return res.json({
            success: true,
            data: {
                fullName: candidate.personal_details?.fullName || "N/A",
                program_name: app.program_name,
                program_code: app.program_code,
                stream: app.stream,
                shift: currentShift || "Shift-1",
                status: app.status || "PENDING",
                application_type: app.application_type // Added this
            }
        });

    } catch (error: any) {
        console.error("getApplicationDetails error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

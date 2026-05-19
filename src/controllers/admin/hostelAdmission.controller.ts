import { Request, Response } from "express";
import CandidateAdmission from "../../models/candidate.model";
import HostelSelection from "../../models/hostelSelection.model";
import mongoose from "mongoose";
import { formatPaymentDate } from "../../utils/dateFormat";

/**
 * @route GET /api/admin/hostel/required-list
 * @desc Get admitted candidates who requested hostel
 * @access Admin
 */
export const getHostelRequiredAdmittedList = async (req: Request, res: Response) => {
    try {
        const academic_year = "2026-2027";

        const candidates = await CandidateAdmission.aggregate([
            {
                $match: {
                    academic_year,
                    "category_and_facilities.facilities.hostel.required": true
                }
            },
            { $unwind: "$application_preferences.applications" },
            {
                $match: {
                    $expr: {
                        $eq: [{ $toLower: "$application_preferences.applications.status" }, "admitted"]
                    }
                }
            },
            {
                $lookup: {
                    from: "hostel_selections",
                    localField: "application_preferences.applications.application_number",
                    foreignField: "application_number",
                    as: "hostel_info"
                }
            },
            {
                $project: {
                    fullName: "$personal_details.fullName",
                    registration_number: 1,
                    application_number: "$application_preferences.applications.application_number",
                    program_name: "$application_preferences.applications.program_name",
                    stream: "$application_preferences.applications.stream",
                    shift: "$application_preferences.applications.shift",
                    gender: "$personal_details.gender",
                    phone: "$personal_details.phone",
                    community: "$personal_details.community",
                    program_type: "$appliedProgrammeType",
                    admission_date: "$application_preferences.applications.admission_details.admission_date",
                    hostel_status: { $ifNull: [{ $arrayElemAt: ["$hostel_info.status", 0] }, "PENDING"] }
                }
            }
        ]);

        return res.json({
            success: true,
            data: candidates
        });
    } catch (error) {
        console.error("Hostel Required List Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * @route POST /api/admin/hostel/select
 * @desc Select a candidate for hostel
 * @access Admin
 */
export const selectCandidateForHostel = async (req: Request, res: Response) => {
    try {
        const { registration_number, application_number, hostel_id, room_type, selected_by } = req.body;
        const academic_year = "2026-2027";

        const selection = await HostelSelection.findOneAndUpdate(
            { application_number },
            {
                registration_number,
                application_number,
                hostel_id,
                room_type,
                status: 'SELECTED',
                selected_at: new Date(),
                selected_by, // contains staff_id, staff_name, department, stream
                academic_year
            },
            { upsert: true, new: true }
        );

        return res.json({
            success: true,
            message: "Candidate selected for hostel",
            data: selection
        });
    } catch (error) {
        console.error("Hostel Selection Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * @route POST /api/admin/hostel/sync-fee-dates
 * @desc Sync transaction dates from fee_collection to admission2026
 * @access Admin
 */
export const syncCandidateFeeDates = async (req: Request, res: Response) => {
    try {
        const admission2026Db = mongoose.connection.useDb("admission2026");
        const feeCollectionDb = mongoose.connection.useDb("fee_collection");

        const candidateFeesMaster = admission2026Db.collection("candidate_fees_master");
        const admissionFees = feeCollectionDb.collection("admission_fees");
        const swipePayments = feeCollectionDb.collection("swipepayments");

        // Fetch all candidates from fees master
        const candidates = await candidateFeesMaster.find({}).toArray();
        let updatedCount = 0;

        console.log(`Starting sync for ${candidates.length} candidates...`);

        for (const candidate of candidates) {
            const appNo = candidate.application_number;
            if (!appNo) continue;

            // Try to find in admission_fees (Online)
            const onlinePayment = await admissionFees.findOne({
                application_number: { $in: [appNo, String(appNo)] },
                status: { $regex: /^success$/i }
            });

            let transactionDate = null;

            if (onlinePayment && onlinePayment.transaction_date) {
                transactionDate = onlinePayment.transaction_date;
            } else {
                // Try to find in swipepayments
                const swipePayment = await swipePayments.findOne({
                    application_number: { $in: [appNo, String(appNo)] },
                    status: { $regex: /^swipe_recorded$/i }
                });
                if (swipePayment && swipePayment.transaction_date) {
                    transactionDate = swipePayment.transaction_date;
                }
            }

            if (transactionDate) {
                // 1. Update candidate_fees_master (admission2026 db)
                await candidateFeesMaster.updateOne(
                    { _id: candidate._id },
                    { $set: { transaction_date: transactionDate } }
                );

                // 2. Update CandidateAdmission (main db)
                const formattedDate = formatPaymentDate(transactionDate);
                if (formattedDate) {
                    const admissionUpdate = await CandidateAdmission.updateOne(
                        { "application_preferences.applications.application_number": appNo },
                        {
                            $set: {
                                "application_preferences.applications.$.admission_details": {
                                    admission_date: new Date(formattedDate),
                                    admit_status: "Yes"
                                }
                            }
                        }
                    );

                    if (admissionUpdate.matchedCount > 0) {
                        console.log(`✅ Updated CandidateAdmission for AppNo: ${appNo}`);
                    } else {
                        console.warn(`⚠️ Could not find CandidateAdmission for AppNo: ${appNo}`);
                    }
                } else {
                    console.warn(`⚠️ Invalid date format for AppNo: ${appNo}, Date: ${transactionDate}`);
                }

                updatedCount++;
            }
        }

        return res.json({
            success: true,
            message: `Successfully synchronized ${updatedCount} transaction dates`,
            updatedCount
        });
    } catch (error) {
        console.error("Sync Fee Dates Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

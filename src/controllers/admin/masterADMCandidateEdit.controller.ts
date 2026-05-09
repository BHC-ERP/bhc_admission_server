import { Request, Response } from "express";
import CandidateAdmission from "../../models/candidate.model";

/**
 * Utility function to flatten a nested object into a single-level object with dot notation keys.
 * This ensures that updating a nested field doesn't overwrite the entire parent object.
 */
const flattenObject = (obj: any, prefix = "") => {
    return Object.keys(obj).reduce((acc: any, k) => {
        const pre = prefix.length ? prefix + "." : "";
        if (
            typeof obj[k] === "object" &&
            obj[k] !== null &&
            !Array.isArray(obj[k]) &&
            !(obj[k] instanceof Date)
        ) {
            Object.assign(acc, flattenObject(obj[k], pre + k));
        } else {
            acc[pre + k] = obj[k];
        }
        return acc;
    }, {});
};

/**
 * @route   PUT /api/admin/master-candidate-edit/:registrationNumber
 * @desc    Update all candidate details by an administrator
 * @access  Admin
 */
export const updateCandidateMaster = async (req: Request, res: Response) => {
    try {
        const { registrationNumber } = req.params;
        const rawUpdateData = req.body;

        if (!registrationNumber) {
            return res.status(400).json({
                success: false,
                message: "Registration number is required",
            });
        }

        // Flatten the incoming data to support granular nested updates
        // This prevents overwriting entire sub-documents like personal_details
        const flattenedData = flattenObject(rawUpdateData);

        // Remove registration_number from update data if present to prevent changing it
        delete flattenedData.registration_number;

        // Perform the update
        const candidate = await CandidateAdmission.findOneAndUpdate(
            { registration_number: Number(registrationNumber) } as any,
            { $set: flattenedData },
            { new: true, runValidators: true }
        );

        if (!candidate) {
            return res.status(404).json({
                success: false,
                message: `Candidate with registration number ${registrationNumber} not found`,
            });
        }

        return res.status(200).json({
            success: true,
            message: "Candidate details updated successfully",
            data: candidate,
        });
    } catch (error: any) {
        console.error("Error in updateCandidateMaster:", error);
        
        // Handle MongoDB duplicate key errors (e.g. email, phone, aadhar)
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `The ${field.split('.').pop()} you entered is already in use by another candidate.`,
            });
        }

        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

/**
 * @route   GET /api/admin/master-candidate-edit/:registrationNumber
 * @desc    Fetch candidate details for editing by an administrator
 * @access  Admin
 */
export const getCandidateForEdit = async (req: Request, res: Response) => {
    try {
        const { registrationNumber } = req.params;

        if (!registrationNumber) {
            return res.status(400).json({
                success: false,
                message: "Registration number is required",
            });
        }

        const candidate = await CandidateAdmission.findOne({ registration_number: Number(registrationNumber) } as any);

        if (!candidate) {
            return res.status(404).json({
                success: false,
                message: `Candidate with registration number ${registrationNumber} not found`,
            });
        }

        return res.status(200).json({
            success: true,
            data: candidate,
        });
    } catch (error: any) {
        console.error("Error in getCandidateForEdit:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

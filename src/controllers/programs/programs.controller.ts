import { Request, Response } from "express";
import programsModel from "../../models/programs.model";

// Get program eligibility details by program_code and stream
export const getProgramEligibility = async (req: Request, res: Response) => {
    try {
        const { program_code, stream } = req.params;
        const program = await programsModel.findOne({ program_code, stream }).select("eligibility_subjects eligibility_description cutoff").lean();
        
        if (!program) {
            return res.status(404).json({ message: "Program not found" });
        }

        return res.json({
            message: "Program eligibility fetched successfully",
            data: program
        });
    } catch (error) {
        console.error("Error fetching program eligibility:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// Update program eligibility details by program_code and stream
export const updateProgramEligibility = async (req: Request, res: Response) => {
    try {
        const { program_code, stream } = req.params;
        const updateData = req.body;

        // Ensure we are only updating eligibility and cutoff
        const safeUpdateData = {
            eligibility_subjects: updateData.eligibility_subjects,
            eligibility_description: updateData.eligibility_description,
            cutoff: updateData.cutoff
        };

        // Remove undefined fields to prevent accidental overwriting with null
        Object.keys(safeUpdateData).forEach((key) => {
            if ((safeUpdateData as any)[key] === undefined) {
                delete (safeUpdateData as any)[key];
            }
        });

        const program = await programsModel.findOneAndUpdate(
            { program_code, stream },
            { $set: safeUpdateData },
            { new: true, runValidators: true }
        ).select("eligibility_subjects eligibility_description cutoff");

        if (!program) {
            return res.status(404).json({ message: "Program not found" });
        }

        return res.json({
            message: "Program eligibility updated successfully",
            data: program
        });
    } catch (error) {
        console.error("Error updating program eligibility:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

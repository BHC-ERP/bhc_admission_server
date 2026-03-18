import { Request, Response } from "express";
import programsModel from "../../models/programs.model";
import CandidateAdmission from "../../models/candidate.model";

/* =========================
   TYPES
========================= */
type ProgrammeStat = {
    program_code: string;
    program_name: string;
    department: string;
    shift: string;
    sanctioned_strength: number;
    count: number;
    remaining: number;
};

export const getProgrammeWiseStats = async (req: Request, res: Response) => {
    try {
        const { programmeType = "UG" } = req.query;

        /* =========================
           GET ALL PROGRAMS
        ========================= */
        const programs = await programsModel.find({
            program_type: programmeType,
            show: true
        }).lean();

        /* =========================
           AGGREGATION
        ========================= */
        const aggregation = await CandidateAdmission.aggregate([
            {
                $match: {
                    appliedProgrammeType: programmeType
                }
            },
            { $unwind: "$application_preferences.applications" },

            /* PAYMENT CHECK */
            {
                $addFields: {
                    isPaid: {
                        $gt: [
                            {
                                $size: {
                                    $filter: {
                                        input: "$payment",
                                        as: "p",
                                        cond: { $eq: ["$$p.status", "success"] }
                                    }
                                }
                            },
                            0
                        ]
                    }
                }
            },

            /* GROUP */
            {
                $group: {
                    _id: {
                        program_code: "$application_preferences.applications.program_code",
                        stream: "$application_preferences.applications.stream",
                        isPaid: "$isPaid"
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        /* =========================
           MAP FOR FAST LOOKUP
        ========================= */
        const countMap: Record<string, number> = {};

        aggregation.forEach((item) => {
            const key = `${item._id.program_code}_${item._id.stream}_${item._id.isPaid}`;
            countMap[key] = item.count;
        });

        /* =========================
           RESULT STRUCTURE
        ========================= */
        const result: {
            aided_free: ProgrammeStat[];
            aided_paid: ProgrammeStat[];
            self_finance_free: ProgrammeStat[];
            self_finance_paid: ProgrammeStat[];
            totals: {
                aided_free: number;
                aided_paid: number;
                self_finance_free: number;
                self_finance_paid: number;
            };
        } = {
            aided_free: [],
            aided_paid: [],
            self_finance_free: [],
            self_finance_paid: [],
            totals: {
                aided_free: 0,
                aided_paid: 0,
                self_finance_free: 0,
                self_finance_paid: 0
            }
        };

        /* =========================
           BUILD DATA
        ========================= */
        programs.forEach((prog: any) => {
            const base = {
                program_code: prog.program_code,
                program_name: prog.program_name,
                department: prog.department_name,
                shift: prog.shift,
                sanctioned_strength: prog.sanctioned_strength || 0
            };

            const aidedFree = countMap[`${prog.program_code}_Aided_false`] || 0;
            const aidedPaid = countMap[`${prog.program_code}_Aided_true`] || 0;
            const sfFree = countMap[`${prog.program_code}_Self-Finance_false`] || 0;
            const sfPaid = countMap[`${prog.program_code}_Self-Finance_true`] || 0;

            /* PUSH DATA */
            result.aided_free.push({
                ...base,
                count: aidedFree,
                remaining: base.sanctioned_strength - aidedFree
            });

            result.aided_paid.push({
                ...base,
                count: aidedPaid,
                remaining: base.sanctioned_strength - aidedPaid
            });

            result.self_finance_free.push({
                ...base,
                count: sfFree,
                remaining: base.sanctioned_strength - sfFree
            });

            result.self_finance_paid.push({
                ...base,
                count: sfPaid,
                remaining: base.sanctioned_strength - sfPaid
            });

            /* TOTALS */
            result.totals.aided_free += aidedFree;
            result.totals.aided_paid += aidedPaid;
            result.totals.self_finance_free += sfFree;
            result.totals.self_finance_paid += sfPaid;
        });

        /* =========================
           RESPONSE
        ========================= */
        return res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error("Programme Stats Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};
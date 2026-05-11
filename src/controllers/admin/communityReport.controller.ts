import { Request, Response } from "express";
import mongoose from "mongoose";
import CandidateAdmission from "../../models/candidate.model";
import programsModel from "../../models/programs.model";

/**
 * @route GET /api/admin/dashboard/admitted-community-report
 * @desc Get admitted candidates with program-wise community counts
 * @access Admin
 */
export const getAdmittedCommunityReport = async (req: Request, res: Response) => {
    try {
        const academic_year = "2026-2027";

        // 1. Get successful application numbers from fee_collection DB
        const feeCollectionDb = mongoose.connection.useDb("fee_collection");
        
        // Find paid applications from both admission_fees and swipepayments
        const [admissionFees, swipePayments] = await Promise.all([
            feeCollectionDb.collection("admission_fees").distinct("application_number", {
                status: { $in: ["SWIPE_RECORDED", "SWIPE_PAID", "SUCCESS"] }
            }),
            feeCollectionDb.collection("swipepayments").distinct("application_number", {
                status: { $in: ["SWIPE_RECORDED", "SWIPE_PAID", "SUCCESS"] }
            })
        ]);

        const paidAppNumbers = Array.from(new Set([
            ...admissionFees.map(val => Number(val)),
            ...swipePayments.map(val => Number(val))
        ].filter(val => val && !isNaN(val))));

        if (paidAppNumbers.length === 0) {
            return res.json({
                success: true,
                data: []
            });
        }

        // 2. Aggregate candidate data for these paid applications
        const reportData = await CandidateAdmission.aggregate([
            { $match: { academic_year } },
            { $unwind: "$application_preferences.applications" },
            { 
                $match: { 
                    "application_preferences.applications.application_number": { $in: paidAppNumbers } 
                } 
            },
            {
                $project: {
                    program_code: "$application_preferences.applications.program_code",
                    program_name: "$application_preferences.applications.program_name",
                    stream: "$application_preferences.applications.stream",
                    shift: { $ifNull: ["$application_preferences.applications.shift", "Shift-1"] },
                    community: { $ifNull: ["$personal_details.community", "Others"] },
                    religion: { $ifNull: ["$personal_details.religion", "Others"] },
                    denomination: { $ifNull: ["$personal_details.christianDenomination", "Others"] },
                    diocese: { $ifNull: ["$personal_details.diocese", "Others"] }
                }
            },
            {
                $group: {
                    _id: {
                        program_code: "$program_code",
                        program_name: "$program_name",
                        stream: "$stream",
                        shift: "$shift",
                        community: "$community",
                        religion: "$religion",
                        denomination: "$denomination",
                        diocese: "$diocese"
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        // 3. Process into a structured format for the table
        const communityHeaders = ["BC", "BC(M)", "MBC", "DNC", "SC", "ST", "SCA", "OC", "Others"];
        
        const programMap: Record<string, any> = {};
        const diocesesSet = new Set<string>();

        reportData.forEach(item => {
            const { program_code, program_name, stream, shift, community, religion, denomination, diocese } = item._id;
            const key = `${program_code}_${stream}_${shift}`;
            
            if (!programMap[key]) {
                programMap[key] = {
                    program_name,
                    program_code,
                    stream,
                    shift,
                    total: 0,
                    christian: 0,
                    csi: 0,
                    dioceses: {}
                };
                communityHeaders.forEach(ch => programMap[key][ch] = 0);
            }

            // Community Mapping
            let commKey = community;
            if (!communityHeaders.includes(commKey)) {
                if (commKey === "BCM") commKey = "BC(M)";
                else if (commKey === "DNT") commKey = "DNC";
                else if (!communityHeaders.includes(commKey)) commKey = "Others";
            }
            programMap[key][commKey] += item.count;
            programMap[key].total += item.count;

            // Religion Mapping
            if (religion === "Christian") {
                programMap[key].christian += item.count;
                if (denomination === "CSI") {
                    programMap[key].csi += item.count;
                    if (diocese && diocese !== "Others" && diocese !== "None") {
                        diocesesSet.add(diocese);
                        programMap[key].dioceses[diocese] = (programMap[key].dioceses[diocese] || 0) + item.count;
                    }
                }
            }
        });

        // Convert the nested dioceses into top-level fields or return as is for frontend processing
        const finalDioceses = Array.from(diocesesSet).sort();
        const result = Object.values(programMap).map((p: any) => {
            const flatP = { ...p };
            finalDioceses.forEach(d => {
                flatP[d] = p.dioceses[d] || 0;
            });
            delete flatP.dioceses;
            return flatP;
        }).sort((a: any, b: any) => 
            a.program_name.localeCompare(b.program_name) || a.stream.localeCompare(b.stream)
        );

        return res.json({
            success: true,
            dioceses: finalDioceses,
            data: result
        });

    } catch (error) {
        console.error("Admitted Community Report Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

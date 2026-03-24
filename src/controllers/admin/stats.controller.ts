import { Request, Response } from "express";
import CandidateAdmission from "../../models/candidate.model";

export const getApplicationStats = async (req: Request, res: Response) => {
    try {
        const { excludeRegNumber = "202600001" } = req.query;

        // Build match condition for excluding specific registration number
        const matchCondition: any = {};
        
        if (excludeRegNumber && excludeRegNumber !== "null") {
            matchCondition.registration_number = { $ne: parseInt(excludeRegNumber as string) };
        }

        /* =========================
           FUNCTION TO GET STATS FOR A SPECIFIC PROGRAMME TYPE
        ========================= */
        const getStatsForProgramme = async (programmeType: string) => {
            const programmeMatchCondition = {
                ...matchCondition,
                appliedProgrammeType: programmeType
            };

            // TOTAL APPLICATIONS
            const totalApplicationsAgg = await CandidateAdmission.aggregate([
                { $match: programmeMatchCondition },
                {
                    $project: {
                        appCount: {
                            $size: {
                                $ifNull: ["$application_preferences.applications", []]
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: "$appCount" }
                    }
                }
            ]);

            const totalApplications = totalApplicationsAgg[0]?.total || 0;

            // PAID APPLICATIONS
            const paidApplications = await CandidateAdmission.countDocuments({
                ...programmeMatchCondition,
                payment: {
                    $elemMatch: { status: "success" }
                }
            });

            // FREE APPLICATIONS
            const freeApplications = await CandidateAdmission.countDocuments({
                ...programmeMatchCondition,
                payment: { $not: { $elemMatch: { status: "success" } } }
            });

            // REGISTERED (submitted_at exists)
            const registered = await CandidateAdmission.countDocuments({
                ...programmeMatchCondition,
                "metadata.submitted_at": { $exists: true }
            });

            // MARKS ENTERED (12th marks available)
            const marksEntered = await CandidateAdmission.countDocuments({
                ...programmeMatchCondition,
                "academic_background.school_education.twelfth.marks.percentage": { $gt: 0 }
            });

            // COURSE-WISE COUNT
            const courseWise = await CandidateAdmission.aggregate([
                { $match: programmeMatchCondition },
                { $unwind: "$application_preferences.applications" },
                {
                    $group: {
                        _id: "$application_preferences.applications.program_name",
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        course: "$_id",
                        count: 1
                    }
                },
                { $sort: { count: -1 } }
            ]);

            // STREAM + PAYMENT STATS
            const streamStatsAgg = await CandidateAdmission.aggregate([
                { $match: programmeMatchCondition },
                { $unwind: "$application_preferences.applications" },
                {
                    $addFields: {
                        paymentArray: {
                            $cond: [
                                { $isArray: "$payment" },
                                "$payment",
                                []
                            ]
                        }
                    }
                },
                {
                    $addFields: {
                        isPaid: {
                            $gt: [
                                {
                                    $size: {
                                        $filter: {
                                            input: "$paymentArray",
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
                {
                    $group: {
                        _id: {
                            stream: "$application_preferences.applications.stream",
                            isPaid: "$isPaid"
                        },
                        count: { $sum: 1 }
                    }
                }
            ]);

            let aidedApplications = 0;
            let selfFinanceApplications = 0;
            let aidedFree = 0;
            let aidedPaid = 0;
            let selfFinanceFree = 0;
            let selfFinancePaid = 0;

            streamStatsAgg.forEach((item) => {
                const { stream, isPaid } = item._id;
                const count = item.count;

                if (stream === "Aided") {
                    aidedApplications += count;
                    if (isPaid) aidedPaid += count;
                    else aidedFree += count;
                }

                if (stream === "Self-Finance") {
                    selfFinanceApplications += count;
                    if (isPaid) selfFinancePaid += count;
                    else selfFinanceFree += count;
                }
            });

            return {
                totalApplications,
                paidApplications,
                freeApplications,
                registered,
                marksEntered,
                courseWise,
                streamStats: {
                    aidedApplications,
                    selfFinanceApplications,
                    aidedFree,
                    aidedPaid,
                    selfFinanceFree,
                    selfFinancePaid
                }
            };
        };

        /* =========================
           GET STATS FOR UG AND PG SEPARATELY
        ========================= */
        const ugStats = await getStatsForProgramme("UG");
        const pgStats = await getStatsForProgramme("PG");

        /* =========================
           GET ALL APPLICATIONS WITH DETAILS (for both UG and PG, excluding specific reg number)
        ========================= */
        const allApplications = await CandidateAdmission.aggregate([
            { $match: matchCondition },
            {
                $project: {
                    registration_number: 1,
                    appliedProgrammeType: 1,
                    "personal_details.fullName": 1,
                    "personal_details.email": 1,
                    "personal_details.phone": 1,
                    "metadata.submitted_at": 1,
                    "admission_status.current": 1,
                    application_count: {
                        $size: {
                            $ifNull: ["$application_preferences.applications", []]
                        }
                    },
                    applications: {
                        $map: {
                            input: "$application_preferences.applications",
                            as: "app",
                            in: {
                                program_name: "$$app.program_name",
                                stream: "$$app.stream",
                                application_number: "$$app.application_number",
                                status: "$$app.status"
                            }
                        }
                    },
                    hasPayment: {
                        $cond: [
                            { $gt: [{ $size: "$payment" }, 0] },
                            true,
                            false
                        ]
                    },
                    paymentStatus: {
                        $cond: [
                            {
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
                            },
                            "paid",
                            "free"
                        ]
                    }
                }
            },
            { $sort: { appliedProgrammeType: 1, registration_number: 1 } }
        ]);

        /* =========================
           SEPARATE UG AND PG APPLICATIONS
        ========================= */
        const ugApplications = allApplications.filter(app => app.appliedProgrammeType === "UG");
        const pgApplications = allApplications.filter(app => app.appliedProgrammeType === "PG");

        /* =========================
           REGISTRATION NUMBERS LIST (separated by type)
        ========================= */
        const registrationNumbers = {
            UG: ugApplications.map(app => app.registration_number),
            PG: pgApplications.map(app => app.registration_number),
            all: allApplications.map(app => app.registration_number)
        };

        /* =========================
           COMPLETE RESPONSE WITH SEPARATE UG AND PG DATA
        ========================= */
        return res.json({
            success: true,
            data: {
                summary: {
                    UG: {
                        totalApplications: ugStats.totalApplications,
                        paidApplications: ugStats.paidApplications,
                        freeApplications: ugStats.freeApplications,
                        registered: ugStats.registered,
                        marksEntered: ugStats.marksEntered,
                        totalCandidates: ugApplications.length,
                        streamStats: ugStats.streamStats,
                        courseWise: ugStats.courseWise
                    },
                    PG: {
                        totalApplications: pgStats.totalApplications,
                        paidApplications: pgStats.paidApplications,
                        freeApplications: pgStats.freeApplications,
                        registered: pgStats.registered,
                        marksEntered: pgStats.marksEntered,
                        totalCandidates: pgApplications.length,
                        streamStats: pgStats.streamStats,
                        courseWise: pgStats.courseWise
                    },
                    combined: {
                        totalApplications: ugStats.totalApplications + pgStats.totalApplications,
                        paidApplications: ugStats.paidApplications + pgStats.paidApplications,
                        freeApplications: ugStats.freeApplications + pgStats.freeApplications,
                        registered: ugStats.registered + pgStats.registered,
                        marksEntered: ugStats.marksEntered + pgStats.marksEntered,
                        totalCandidates: allApplications.length,
                        streamStats: {
                            aidedApplications: ugStats.streamStats.aidedApplications + pgStats.streamStats.aidedApplications,
                            selfFinanceApplications: ugStats.streamStats.selfFinanceApplications + pgStats.streamStats.selfFinanceApplications,
                            aidedFree: ugStats.streamStats.aidedFree + pgStats.streamStats.aidedFree,
                            aidedPaid: ugStats.streamStats.aidedPaid + pgStats.streamStats.aidedPaid,
                            selfFinanceFree: ugStats.streamStats.selfFinanceFree + pgStats.streamStats.selfFinanceFree,
                            selfFinancePaid: ugStats.streamStats.selfFinancePaid + pgStats.streamStats.selfFinancePaid
                        }
                    }
                },
                
                // All applications with their details
                applications: {
                    UG: ugApplications,
                    PG: pgApplications,
                    all: allApplications
                },
                
                // Registration numbers list
                registrationNumbers,
                
                // Filter info
                filterInfo: {
                    excludedRegistrationNumber: excludeRegNumber === "null" ? "none" : excludeRegNumber,
                    totalRecords: allApplications.length,
                    ugRecords: ugApplications.length,
                    pgRecords: pgApplications.length
                }
            }
        });

    } catch (error) {
        console.error("Dashboard Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};
import { Request, Response } from "express";
import CandidateAdmission from "../../models/candidate.model";

export const getApplicationStats = async (req: Request, res: Response) => {
    try {
        const { excludeRegNumber = "202600001" } = req.query;

        const matchCondition: any = {};

        if (excludeRegNumber && excludeRegNumber !== "null") {
            matchCondition.registration_number = {
                $ne: parseInt(excludeRegNumber as string)
            };
        }

        /* =========================
           🔥 SINGLE AGGREGATION (FAST)
        ========================= */

        const statsAgg = await CandidateAdmission.aggregate([
            { $match: matchCondition },

            {
                $facet: {
                    /* =========================
                       APPLICATION STATS (UG + PG)
                    ========================= */
                    applicationStats: [
                        { $unwind: "$application_preferences.applications" },

                        {
                            $addFields: {
                                program: "$appliedProgrammeType",
                                stream: "$application_preferences.applications.stream",
                                isPaid: {
                                    $gt: [
                                        {
                                            $size: {
                                                $filter: {
                                                    input: { $ifNull: ["$payment", []] },
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
                                    program: "$program",
                                    stream: "$stream",
                                    isPaid: "$isPaid"
                                },
                                count: { $sum: 1 }
                            }
                        }
                    ],

                    /* =========================
                       TOTAL APPLICATION COUNT
                    ========================= */
                    totalApplications: [
                        {
                            $project: {
                                program: "$appliedProgrammeType",
                                count: {
                                    $size: {
                                        $ifNull: ["$application_preferences.applications", []]
                                    }
                                }
                            }
                        },
                        {
                            $group: {
                                _id: "$program",
                                total: { $sum: "$count" }
                            }
                        }
                    ],

                    /* =========================
                       REGISTERED
                    ========================= */
                    registered: [
                        {
                            $match: {
                                "metadata.submitted_at": { $exists: true }
                            }
                        },
                        {
                            $group: {
                                _id: "$appliedProgrammeType",
                                count: { $sum: 1 }
                            }
                        }
                    ],

                    /* =========================
                       MARKS ENTERED
                    ========================= */
                    marksEntered: [
                        {
                            $match: {
                                "academic_background.school_education.twelfth.marks.percentage": { $gt: 0 }
                            }
                        },
                        {
                            $group: {
                                _id: "$appliedProgrammeType",
                                count: { $sum: 1 }
                            }
                        }
                    ],

                    /* =========================
                       COURSE WISE
                    ========================= */
                    courseWise: [
                        { $unwind: "$application_preferences.applications" },
                        {
                            $group: {
                                _id: {
                                    program: "$appliedProgrammeType",
                                    course: "$application_preferences.applications.program_name"
                                },
                                count: { $sum: 1 }
                            }
                        }
                    ],

                    /* =========================
                       APPLICATION LIST
                    ========================= */
                    applications: [
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

                                paymentStatus: {
                                    $cond: [
                                        {
                                            $gt: [
                                                {
                                                    $size: {
                                                        $filter: {
                                                            input: { $ifNull: ["$payment", []] },
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
                        }
                    ]
                }
            }
        ]);

        const data = statsAgg[0];

        /* =========================
           🔥 TRANSFORM FUNCTION
        ========================= */

        const init = () => ({
            totalApplications: 0,
            paidApplications: 0,
            freeApplications: 0,
            registered: 0,
            marksEntered: 0,
            totalCandidates: 0,
            streamStats: {
                aidedApplications: 0,
                selfFinanceApplications: 0,
                aidedFree: 0,
                aidedPaid: 0,
                selfFinanceFree: 0,
                selfFinancePaid: 0
            },
            courseWise: []
        });

        const summary: any = {
            UG: init(),
            PG: init(),
            combined: init()
        };

        /* =========================
           PROCESS APPLICATION STATS
        ========================= */

        data.applicationStats.forEach((item: any) => {
            const { program, stream, isPaid } = item._id;
            const count = item.count;

            const target = summary[program];
            const combined = summary.combined;

            target.totalApplications += count;
            combined.totalApplications += count;

            if (isPaid) {
                target.paidApplications += count;
                combined.paidApplications += count;
            } else {
                target.freeApplications += count;
                combined.freeApplications += count;
            }

            if (stream === "Aided") {
                target.streamStats.aidedApplications += count;
                combined.streamStats.aidedApplications += count;

                if (isPaid) {
                    target.streamStats.aidedPaid += count;
                    combined.streamStats.aidedPaid += count;
                } else {
                    target.streamStats.aidedFree += count;
                    combined.streamStats.aidedFree += count;
                }
            }

            if (stream === "Self-Finance") {
                target.streamStats.selfFinanceApplications += count;
                combined.streamStats.selfFinanceApplications += count;

                if (isPaid) {
                    target.streamStats.selfFinancePaid += count;
                    combined.streamStats.selfFinancePaid += count;
                } else {
                    target.streamStats.selfFinanceFree += count;
                    combined.streamStats.selfFinanceFree += count;
                }
            }
        });

        /* =========================
           TOTAL APPLICATIONS FIX
        ========================= */

        data.totalApplications.forEach((item: any) => {
            summary[item._id].totalApplications = item.total;
        });

        /* =========================
           REGISTERED & MARKS
        ========================= */

        data.registered.forEach((item: any) => {
            summary[item._id].registered = item.count;
        });

        data.marksEntered.forEach((item: any) => {
            summary[item._id].marksEntered = item.count;
        });

        /* =========================
           COURSE WISE
        ========================= */

        data.courseWise.forEach((item: any) => {
            summary[item._id.program].courseWise.push({
                course: item._id.course,
                count: item.count
            });
        });

        /* =========================
           APPLICATION LIST
        ========================= */

        const allApplications = data.applications;

        const ugApplications = allApplications.filter(
            (a: any) => a.appliedProgrammeType === "UG"
        );

        const pgApplications = allApplications.filter(
            (a: any) => a.appliedProgrammeType === "PG"
        );

        summary.UG.totalCandidates = ugApplications.length;
        summary.PG.totalCandidates = pgApplications.length;
        summary.combined.totalCandidates = allApplications.length;

        /* =========================
           FINAL RESPONSE
        ========================= */

        return res.json({
            success: true,
            data: {
                summary,
                applications: {
                    UG: ugApplications,
                    PG: pgApplications,
                    all: allApplications
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
import { Request, Response } from "express";
import mongoose from "mongoose";
import CandidateAdmission from "../../models/candidate.model";
import Program from "../../models/programs.model";

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
                                    program_code: "$application_preferences.applications.program_code",
                                    program_name: "$application_preferences.applications.program_name",
                                    programType: "$appliedProgrammeType"
                                },
                                count: { $sum: 1 },
                                registered: {
                                    $sum: {
                                        $cond: [
                                            { $gt: ["$metadata.submitted_at", null] },
                                            1,
                                            0
                                        ]
                                    }
                                },
                                marksEntered: {
                                    $sum: {
                                        $cond: [
                                            { $gt: ["$academic_background.school_education.twelfth.marks.percentage", 0] },
                                            1,
                                            0
                                        ]
                                    }
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "programs",
                                localField: "_id.program_code",
                                foreignField: "program_code",
                                as: "program_info"
                            }
                        },
                        {
                            $addFields: {
                                department_code: { $arrayElemAt: ["$program_info.department_code", 0] },
                                department_name: { $arrayElemAt: ["$program_info.department_name", 0] },
                                stream: { $arrayElemAt: ["$program_info.stream", 0] }
                            }
                        },
                        {
                            $project: {
                                program_info: 0
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
                                            program_code: "$$app.program_code",
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
            courseWise: [],
            departmentWise: []
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

        const departmentMapStats: any = {
            UG: {} as Record<string, any>,
            PG: {} as Record<string, any>,
            combined: {} as Record<string, any>
        };

        data.courseWise.forEach((item: any) => {
            const courseData = {
                department_code: item.department_code,
                department_name: item.department_name,
                stream: item.stream,
                program_code: item._id.program_code,
                course: item._id.program_name,
                count: item.count,
                registered: item.registered || 0,
                marksEntered: item.marksEntered || 0
            };

            const pt = item._id.programType;
            summary[pt].courseWise.push(courseData);
            summary.combined.courseWise.push(courseData);

            // Department Wise Aggregation
            [pt, "combined"].forEach(type => {
                const deptCode = item.department_code || "UNKNOWN";
                if (!departmentMapStats[type][deptCode]) {
                    departmentMapStats[type][deptCode] = {
                        department_code: item.department_code,
                        department_name: item.department_name,
                        count: 0,
                        registered: 0,
                        marksEntered: 0
                    };
                }
                departmentMapStats[type][deptCode].count += courseData.count;
                departmentMapStats[type][deptCode].registered += courseData.registered;
                departmentMapStats[type][deptCode].marksEntered += courseData.marksEntered;
            });
        });

        summary.UG.departmentWise = Object.values(departmentMapStats.UG);
        summary.PG.departmentWise = Object.values(departmentMapStats.PG);
        summary.combined.departmentWise = Object.values(departmentMapStats.combined);

        /* =========================
           APPLICATION LIST
        ========================= */

        /* =========================
           ENRICH WITH DEPT CODE
        ========================= */
        const allPrograms = await Program.find({}, "program_code department_code department_name").lean();
        const deptMap: Record<string, { code: string, name: string }> = {};
        allPrograms.forEach(p => {
            if (p.program_code) {
                deptMap[p.program_code] = {
                    code: p.department_code || "",
                    name: (p as any).department_name || ""
                };
            }
        });

        const allApplications = data.applications.map((cand: any) => ({
            ...cand,
            applications: cand.applications.map((app: any) => ({
                ...app,
                department_code: deptMap[app.program_code]?.code || "",
                department_name: deptMap[app.program_code]?.name || ""
            }))
        }));

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

export const getFullPaymentStats = async (req: Request, res: Response) => {
    try {
        const feeCollectionDb = mongoose.connection.useDb("fee_collection");
        const admissionFeesCollection = feeCollectionDb.collection("admission_fees");
        const swipeCollection = feeCollectionDb.collection("swipepayments");

        const onlineCount = await admissionFeesCollection.countDocuments({ status: "SUCCESS" });
        const swipeCount = await swipeCollection.countDocuments({ status: "SWIPE_RECORDED" });

        const onlineAmountAgg = await admissionFeesCollection.aggregate([
            { $match: { status: "SUCCESS" } },
            {
                $group: {
                    _id: null,
                    total: { $sum: { $toDouble: { $ifNull: ["$amount", 0] } } }
                }
            }
        ]).toArray();

        const swipeAmountAgg = await swipeCollection.aggregate([
            { $match: { status: "SWIPE_RECORDED" } },
            {
                $group: {
                    _id: null,
                    total: { $sum: { $toDouble: { $ifNull: ["$total_amount", 0] } } }
                }
            }
        ]).toArray();

        const onlineTotalAmount = onlineAmountAgg[0]?.total || 0;
        const swipeTotalAmount = swipeAmountAgg[0]?.total || 0;

        return res.json({
            success: true,
            data: {
                online: {
                    count: onlineCount,
                    total_amount: onlineTotalAmount
                },
                swipe: {
                    count: swipeCount,
                    total_amount: swipeTotalAmount
                },
                total: {
                    count: onlineCount + swipeCount,
                    total_amount: onlineTotalAmount + swipeTotalAmount
                }
            }
        });
    } catch (error: any) {
        console.error("Get Full Payment Stats Error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal Server Error" });
    }
};
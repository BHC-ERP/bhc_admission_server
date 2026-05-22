import { Request, Response, Router } from "express";
import mongoose from "mongoose";
import CandidateAdmission from "../models/candidate.model";
import programsModel from "../models/programs.model";
import { getApplicationStats, getFullPaymentStats } from "../controllers/admin/stats.controller";
import { getProgrammeWiseStats } from "../controllers/admin/program.stats.controller";
import { getFullStatistics } from "../controllers/admin/full.stats.controller";
import { getOverallAdmissionStatistics } from "../controllers/admin/overallAdmissionStatistics.controller";
import {
  getNotification,
  createNotification,
  updateNotification,
  deleteNotification
} from "../controllers/admin/notification.controller";
import { backupDatabaseJSON } from "../controllers/admin/backup.controller";
import { updateCandidateMaster, getCandidateForEdit } from "../controllers/admin/masterADMCandidateEdit.controller";
import { getAdmittedCommunityReport } from "../controllers/admin/communityReport.controller";
import { getHostelRequiredAdmittedList, selectCandidateForHostel, syncCandidateFeeDates } from "../controllers/admin/hostelAdmission.controller";
import { fixAdmissionDates, processSwipePayments } from "../controllers/admin/script.controller";
import { connectDB } from "../config/database";

// import { Parser } from "json2csv";
const router = Router();

/**
 * @route GET /api/admin/verification/list
 * @desc Get all candidates with applications in HOD_SELECTION or HOD_SELECTION_INTERVIEW status
 * @access Admin/Verifier
 */
router.get("/verification/list", async (req: Request, res: Response) => {
  try {
    const { from_date, to_date } = req.query;

    const matchConditions: any = {
      "application_preferences.applications.status": {
        $in: ["HOD_SELECTION", "HOD_SELECTION_INTERVIEW", "VERIFIED"]
      }
    };

    if (from_date || to_date) {
      matchConditions["metadata.submitted_at"] = {};
      if (from_date) matchConditions["metadata.submitted_at"]["$gte"] = new Date(from_date as string);
      if (to_date) matchConditions["metadata.submitted_at"]["$lte"] = new Date(to_date as string);
    }

    const applications = await CandidateAdmission.find(matchConditions).sort({ "metadata.submitted_at": -1 });

    return res.status(200).json({
      success: true,
      total: applications.length,
      data: applications
    });
  } catch (error) {
    console.error("Error fetching verification list:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
});

/**
 * GET Applications by Program Code
 * Example:
 * /api/applications/UG-BSC-ND
 */

// router.get(
//   "/applications/:programCode",
//   async (req: Request, res: Response) => {
//     try {

//       const { programCode } = req.params;

//       /* STEP 1: Check Program Exists */

//       const program = await programsModel.findOne({
//         program_code: programCode 
//       });

//       if (!program) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid program code"
//         });
//       }

//       /* STEP 2: Fetch Applications */

//       const applications = await CandidateAdmission.find(
//         {
//           "application_preferences.applications.program_code": programCode
//         },
//         {
//           registration_number: 1,
//           personal_details: 1,
//           academic_background: 1,
//           documents: 1,
//           application_preferences: {
//             $elemMatch: { program_code: programCode }
//           }
//         }
//       );

//       return res.status(200).json({
//         success: true,
//         program: {
//           program_code: program.program_code,
//           program_name: program.program_name,
//           department_name: program.department_name,
//           stream: program.stream,
//           shift: program.shift
//         },
//         total_applications: applications.length,
//         data: applications
//       });

//     } catch (error) {
//       console.error("Error:", error);
//       return res.status(500).json({
//         success: false,
//         message: "Server Error"
//       });
//     }
//   }
// );

router.get(
  "/applications/:programCode/:stream",
  async (req: Request, res: Response) => {
    try {
      const { programCode, stream } = req.params;

      /* STEP 1: Check Program Exists */

      const program = await programsModel.findOne({
        program_code: programCode
      });

      if (!program) {
        return res.status(400).json({
          success: false,
          message: "Invalid program code"
        });
      }

      /* STEP 2: Fetch Applications */

      const applications = await CandidateAdmission.aggregate([

        {
          $addFields: {
            all_applications: "$application_preferences.applications"
          }
        },

        {
          $unwind: "$application_preferences.applications"
        },

        {
          $match: {
            "application_preferences.applications.program_code": programCode,
            ...(String(stream).toLowerCase() !== 'both' && {
              "application_preferences.applications.stream": stream
            })
          }
        },

        {
          $project: {
            registration_number: 1,
            personal_details: 1,
            academic_background: 1,
            category_and_facilities: 1,
            documents: 1,
            applications: "$application_preferences.applications",
            all_applications: 1
          }
        }

      ]);

      if (applications.length === 0) {
        return res.status(200).json({
          success: true,
          program: {
            program_code: program.program_code,
            program_name: program.program_name,
            department_name: program.department_name,
            stream: program.stream,
            shift: program.shift
          },
          total_applications: 0,
          message: "No applications found for this stream",
          data: []
        });
      }

      return res.status(200).json({
        success: true,
        program: {
          program_code: program.program_code,
          program_name: program.program_name,
          department_name: program.department_name,
          stream: program.stream,
          shift: program.shift
        },
        total_applications: applications.length,
        data: applications
      });

    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error"
      });
    }
  }
);

/**
 * @route PUT /api/admin/candidates/status/:candidateId
 * @desc Update single candidate application status
 * @access Public (User data passed in body)
 */
router.put('/candidates/status/:application_number', async (req, res) => {
  try {
    const { application_number: paramAppNo } = req.params;
    const {
      status,
      remarks,
      program_code,
      interviewDate,
      user,
      stream,
      shift,
      isOtherApplication,
      program_name
    } = req.body;

    if (!program_code && !paramAppNo) {
      return res.status(400).json({
        success: false,
        message: 'Program code or Application number is required'
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'User data is required'
      });
    }

    if (!user.staff_id || !user.name) {
      return res.status(400).json({
        success: false,
        message: 'User must contain staff_id and name'
      });
    }

    const validStatuses = [
      'HOD_SELECTION',
      'HOD_SELECTION_INTERVIEW',
      'VERIFIED',
      'SMS_SENT',
      'TRANSFERRED',
      'TRANSFERED',
      'NOT_SELECTED',
      'ADMISSION',
      'ADMIT'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }


    const currentDate = new Date();
    const appNoToSearch = Number(paramAppNo);

    const candidate = await CandidateAdmission.findOne({
      "application_preferences.applications.application_number": appNoToSearch
    });

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    if (!candidate.application_preferences ||
      !candidate.application_preferences.applications?.length) {
      return res.status(400).json({
        success: false,
        message: 'Candidate has no applications'
      });
    }

    const applicationIndex = candidate.application_preferences.applications.findIndex(
      app => app.application_number === appNoToSearch
    );

    if (applicationIndex === -1) {
      return res.status(400).json({
        success: false,
        message: `Application number ${appNoToSearch} not found`
      });
    }

    const targetApplication = candidate.application_preferences.applications[applicationIndex];

    const originalStream = targetApplication.stream;

    // 1. Map Stream and Shift from radio button (user.shift)
    let mappedStream = stream;
    let mappedShift = shift;

    if (user.shift === 'Aided') {
      mappedStream = 'Aided';
      mappedShift = 'Shift-1';
    } else if (user.shift === 'SF-Shift-1') {
      mappedStream = 'Self-Finance';
      mappedShift = 'Shift-1';
    } else if (user.shift === 'SF-Shift-2') {
      mappedStream = 'Self-Finance';
      mappedShift = 'Shift-2';
    }

    let admissionStream = mappedStream || originalStream;
    let isStreamChanged = admissionStream !== originalStream;

    // 2. Resolve OT Program details for Other Applications
    let otProgramCode = program_code;
    let otProgramName = program_name;

    if (isOtherApplication) {
      const hodDeptCode = user.department_code || user.department;
      if (hodDeptCode) {
        // Try to find program matching HOD's dept, candidate's degree type, and selected stream/shift
        const hodProgram = await programsModel.findOne({
          department_code: hodDeptCode.toUpperCase(),
          program_type: candidate.appliedProgrammeType,
          stream: admissionStream,
          shift: mappedShift
        });

        if (hodProgram) {
          otProgramCode = hodProgram.program_code;
          otProgramName = hodProgram.program_name;
        } else {
          // Fallback to any program in HOD's dept matching the degree type (UG/PG)
          const fallbackProgram = await programsModel.findOne({
            department_code: hodDeptCode.toUpperCase(),
            program_type: candidate.appliedProgrammeType
          });
          if (fallbackProgram) {
            otProgramCode = fallbackProgram.program_code;
            otProgramName = fallbackProgram.program_name;
          }
        }
      }
    }

    const updatedApplications = candidate.application_preferences.applications.map((app, index) => {

      if (index === applicationIndex) {

        const updatedApp: any = {
          ...(app.toObject ? app.toObject() : app),

          status: status,
          stream: admissionStream,
          shift: mappedShift || app.shift,
          original_stream: isStreamChanged ? originalStream : undefined,

          staff_id: user.staff_id,
          staff_name: user.name,
          staff_department: user.department_code || user.department,

          selection_date: currentDate,
          selection_remarks: remarks || '',

          /* ✅ Added Selected History Array */
          selected: [
            ...(app.selected || []),
            {
              is_other_application: isOtherApplication || false,
              selected_ot_programcode: isOtherApplication ? otProgramCode : undefined,
              selected_ot_program_name: isOtherApplication ? otProgramName : undefined,
              selected_ot_stream: isOtherApplication ? admissionStream : undefined,
              selected_by: {
                staff_id: user.staff_id,
                staff_name: user.name,
                department: user.department_code || user.department,
                designation: user.designation,
                selected_program_code: isOtherApplication ? otProgramCode : app.program_code,
                selected_program_name: isOtherApplication ? otProgramName : app.program_name,
                selected_stream: admissionStream,
                selected_shift: mappedShift || app.shift
              },
              selection_date: currentDate,
              selection_remarks: remarks || '',
              ...(status === 'HOD_SELECTION_INTERVIEW' && interviewDate
                ? {
                  interview_details: {
                    scheduled_date: interviewDate,
                    scheduled_by: user.name,
                    scheduled_by_id: user.staff_id,
                    scheduled_at: currentDate
                  }
                }
                : {})
            }
          ]
        };

        if (isStreamChanged) {
          const streamChangeNote = `[Stream Changed: Applied for ${originalStream}, Admitted to ${admissionStream}]`;

          updatedApp.selection_remarks = updatedApp.selection_remarks
            ? `${streamChangeNote} ${updatedApp.selection_remarks}`
            : streamChangeNote;

          updatedApp.stream_change_history = updatedApp.stream_change_history || [];

          updatedApp.stream_change_history.push({
            from_stream: originalStream,
            to_stream: admissionStream,
            changed_by: user.name,
            changed_by_id: user.staff_id,
            changed_at: currentDate,
            reason: remarks || 'Stream changed by HOD'
          });
        }

        if (status === 'HOD_SELECTION_INTERVIEW' && !interviewDate) {
          updatedApp.interview_requested = true;
          updatedApp.interview_status = 'Pending Scheduling';
        }

        return updatedApp;
      }

      return app;
    });

    const updatedCandidate = await CandidateAdmission.findByIdAndUpdate(
      candidate._id,
      {
        $set: {
          'application_preferences.applications': updatedApplications,
          'admission_status.current': status,
          updatedAt: currentDate
        }
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedCandidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate update failed"
      });
    }

    const updatedApplication = updatedCandidate.application_preferences?.applications?.find(
      app => app.application_number === appNoToSearch
    );

    res.status(200).json({
      success: true,
      message: isStreamChanged
        ? `Candidate admitted to ${admissionStream} (originally applied for ${originalStream})`
        : 'Candidate status updated successfully',
      data: {
        candidate: {
          _id: updatedCandidate._id,
          registration_number: updatedCandidate.registration_number,
          personal_details: {
            fullName: updatedCandidate.personal_details?.fullName,
            email: updatedCandidate.personal_details?.email,
            phone: updatedCandidate.personal_details?.phone
          }
        },
        application: updatedApplication
      }
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Failed to update candidate status'
    });

  }
});

router.get(
  "/applications/selected/:programCode/:stream",
  async (req: Request, res: Response) => {
    try {

      const { programCode, stream } = req.params;
      const { from_date, to_date, community } = req.query;

      /* STEP 1: Check Program Exists */

      const program = await programsModel.findOne({
        program_code: programCode
      });

      if (!program) {
        return res.status(400).json({
          success: false,
          message: "Invalid program code"
        });
      }

      /* STEP 2: Build Match Conditions */

      const matchConditions: any = {
        "application_preferences.applications.program_code": programCode,
        "application_preferences.applications.stream": stream,
        "application_preferences.applications.selected": { $ne: [] } // Has at least one selection
      };

      // Add date range filter if provided
      if (from_date || to_date) {
        matchConditions["application_preferences.applications.selected.selection_date"] = {};
        if (from_date) {
          matchConditions["application_preferences.applications.selected.selection_date"]["$gte"] = new Date(from_date as string);
        }
        if (to_date) {
          matchConditions["application_preferences.applications.selected.selection_date"]["$lte"] = new Date(to_date as string);
        }
      }

      // Add community filter if provided
      if (community) {
        matchConditions["personal_details.community"] = community;
      }

      /* STEP 3: Fetch Selected Applications - NEWEST FIRST */

      const selectedApplications = await CandidateAdmission.aggregate([

        // Unwind the applications array
        {
          $unwind: "$application_preferences.applications"
        },

        // Match program code, stream, and selected status
        {
          $match: matchConditions
        },

        // Add field to get the latest selection for sorting
        {
          $addFields: {
            "application_preferences.applications.latestSelection": {
              $arrayElemAt: [
                {
                  $sortArray: {
                    input: "$application_preferences.applications.selected",
                    sortBy: { selection_date: -1 } // Sort selections by date (newest first)
                  }
                },
                0 // Get the newest selection
              ]
            }
          }
        },

        // Project only necessary fields
        {
          $project: {
            registration_number: 1,
            "personal_details.fullName": 1,
            "personal_details.email": 1,
            "personal_details.phone": 1,
            "personal_details.gender": 1,
            "personal_details.community": 1,
            "personal_details.caste": 1,
            "personal_details.religion": 1,
            "academic_background.programmeName": 1,
            "academic_background.undergraduate_education": 1,
            "academic_background.school_education": 1,
            "payment.status": 1,
            "payment.payment_date": 1,
            "metadata.submitted_at": 1,
            application: "$application_preferences.applications",
            selection_date: "$application_preferences.applications.latestSelection.selection_date",
            selected_by: "$application_preferences.applications.latestSelection.selected_by",
            selection_remarks: "$application_preferences.applications.latestSelection.selection_remarks"
          }
        },

        // Sort by selection date - NEWEST FIRST (descending order)
        {
          $sort: {
            selection_date: -1 // -1 for descending (newest first), 1 for ascending (oldest first)
          }
        }

      ]);

      if (selectedApplications.length === 0) {
        return res.status(200).json({
          success: true,
          program: program ? {
            program_code: program.program_code,
            program_name: program.program_name,
            department_name: program.department_name,
            stream: program.stream,
            shift: program.shift
          } : { program_code: programCode, program_name: 'Unknown' },
          filters_applied: {
            from_date: from_date || null,
            to_date: to_date || null,
            community: community || null
          },
          total_selected: 0,
          message: "No selected candidates found for this program/stream",
          data: []
        });
      }
      interface SelectionSummary {
        total_selected: number;
        newest_selection: Date | null;
        oldest_selection: Date | null;
        by_selector: {
          [key: string]: number;  // Index signature for dynamic staff names
        };
      }

      // Then use it:
      const selectionSummary: SelectionSummary = {
        total_selected: selectedApplications.length,
        newest_selection: selectedApplications[0]?.selection_date || null,
        oldest_selection: selectedApplications[selectedApplications.length - 1]?.selection_date || null,
        by_selector: {}
      };
      // Count selections by staff
      selectedApplications.forEach(app => {
        if (app.selected_by) {
          const staffName = app.selected_by.staff_name;
          if (!selectionSummary.by_selector[staffName]) {
            selectionSummary.by_selector[staffName] = 0;
          }
          selectionSummary.by_selector[staffName]++;
        }
      });

      return res.status(200).json({
        success: true,
        program: program ? {
          program_code: program.program_code,
          program_name: program.program_name,
          department_name: program.department_name,
          stream: program.stream,
          shift: program.shift
        } : { program_code: programCode, program_name: 'Unknown' },
        filters_applied: {
          from_date: from_date || null,
          to_date: to_date || null,
          community: community || null
        },
        selection_summary: selectionSummary,
        total_selected: selectedApplications.length,
        data: selectedApplications
      });

    } catch (error) {
      console.error("Error fetching selected candidates:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error while fetching selected candidates"
      });
    }
  }
);

router.get(
  "/applications/other-selections/:programCode/:stream",
  async (req: Request, res: Response) => {
    try {
      const { programCode, stream } = req.params;
      const { from_date, to_date } = req.query;

      const selectedApplications = await CandidateAdmission.aggregate([
        // Step 1: Unwind applications array
        { $unwind: "$application_preferences.applications" },

        // Step 2: Unwind selected array to filter individual elements
        { $unwind: "$application_preferences.applications.selected" },

        // Step 3: Match only is_other_application: true entries
        {
          $match: {
            "application_preferences.applications.selected.is_other_application": true,
            ...(programCode !== "all" && {
              "application_preferences.applications.selected.selected_ot_programcode": programCode,
            }),
            ...(stream !== "all" && {
              "application_preferences.applications.selected.selected_ot_stream": stream,
            }),
            ...(from_date || to_date
              ? {
                "application_preferences.applications.selected.selection_date": {
                  ...(from_date && { $gte: new Date(from_date as string) }),
                  ...(to_date && { $lte: new Date(to_date as string) }),
                },
              }
              : {}),
          },
        },

        // Step 4: Group back — one doc per candidate+application with matched selections
        {
          $group: {
            _id: {
              candidate_id: "$_id",
              application_number:
                "$application_preferences.applications.application_number",
            },
            registration_number: { $first: "$registration_number" },
            personal_details: { $first: "$personal_details" },
            academic_background: { $first: "$academic_background" },
            payment: { $first: "$payment" },
            metadata: { $first: "$metadata" },
            hostel_required: { $first: "$hostel_required" },
            transport_required: { $first: "$transport_required" },
            application_info: {
              $first: {
                application_number:
                  "$application_preferences.applications.application_number",
                application_type:
                  "$application_preferences.applications.application_type",
                stream: "$application_preferences.applications.stream",
                program_code:
                  "$application_preferences.applications.program_code",
                program_name:
                  "$application_preferences.applications.program_name",
                shift: "$application_preferences.applications.shift",
                preference_order:
                  "$application_preferences.applications.preference_order",
                status: "$application_preferences.applications.status",
              },
            },
            // Collect all matched selected entries back into array
            matched_selections: {
              $push: "$application_preferences.applications.selected",
            },
          },
        },

        // Step 5: Add latest selection date for sorting
        {
          $addFields: {
            latest_selection_date: {
              $max: "$matched_selections.selection_date",
            },
          },
        },

        // Step 6: Sort by latest selection date descending
        { $sort: { latest_selection_date: -1 } },

        // Step 7: Clean up final shape
        {
          $project: {
            _id: "$_id.candidate_id",
            registration_number: 1,
            personal_details: 1,
            academic_background: 1,
            payment: 1,
            metadata: 1,
            hostel_required: 1,
            transport_required: 1,
            application: {
              $mergeObjects: [
                "$application_info",
                { selected: "$matched_selections" },
              ],
            },
            latest_selection_date: 1,
          },
        },
      ]);

      return res.status(200).json({
        success: true,
        total_selected: selectedApplications.length,
        data: selectedApplications,
      });
    } catch (error) {
      console.error("Error fetching other selections:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error while fetching other selections",
      });
    }
  }
);

router.get("/dashboard/stats", getApplicationStats);
router.get("/dashboard/programme-wise", getProgrammeWiseStats);
router.get("/dashboard/full-statistics", getFullStatistics);
router.get("/dashboard/overall-admission-statistics", getOverallAdmissionStatistics);
router.get("/dashboard/admitted-community-report", getAdmittedCommunityReport);

// Hostel Admission Routes
router.get("/hostel/required-list", getHostelRequiredAdmittedList);
router.post("/hostel/select", selectCandidateForHostel);
router.post("/hostel/sync-fee-dates", syncCandidateFeeDates);
// ++++++++++++++++++++++++Site Notification++++++++++++++++++++++++++
router.get("/adm_site/notification", getNotification);
router.post("/adm_site/notification", createNotification);
router.put("/adm_site/notification/:id", updateNotification);
router.delete("/adm_site/notification/:id", deleteNotification);
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// ++++++++++++++++++++++++Remove Selection++++++++++++++++++++++++++++
/**
 * @route DELETE /api/admin/candidates/selection/:candidateId
 * @desc Remove candidate selection (revert to Applied)
 * @access HOD only
 */
router.delete('/candidates/selection/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { program_code, application_number, user } = req.body;

    if (!program_code && !application_number) {
      return res.status(400).json({
        success: false,
        message: 'Program code or Application number is required'
      });
    }

    if (!user || !user.staff_id) {
      return res.status(400).json({
        success: false,
        message: 'User information is required'
      });
    }

    const candidate = await CandidateAdmission.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    const applications = candidate.application_preferences?.applications || [];
    const applicationIndex = applications.findIndex(
      app => application_number
        ? app.application_number === Number(application_number)
        : app.program_code === program_code
    );

    if (applicationIndex === -1) {
      return res.status(400).json({
        success: false,
        message: application_number
          ? `Application number ${application_number} not found`
          : `Program code ${program_code} not found`
      });
    }

    // Role-based status logic
    const userRole = user.role;
    const isVerifier = (Array.isArray(userRole) ? userRole : [userRole]).some((r: any) => String(r).toLowerCase().includes('adm:verify'));
    const targetStatus = isVerifier ? 'HOD_SELECTION' : 'Applied';

    // Build update object using positional operator if possible, but simpler to use findByIdAndUpdate with $set on the index
    const updatePath = `application_preferences.applications.${applicationIndex}`;
    const updateData: any = {
      $set: {
        [`${updatePath}.status`]: targetStatus,
        'admission_status.current': targetStatus,
        'updatedAt': new Date()
      },
      $unset: {
        [`${updatePath}.staff_id`]: 1,
        [`${updatePath}.staff_name`]: 1,
        [`${updatePath}.staff_department`]: 1,
        [`${updatePath}.selection_date`]: 1,
        [`${updatePath}.selection_remarks`]: 1,
        [`${updatePath}.interview_requested`]: 1,
        [`${updatePath}.interview_status`]: 1
      }
    };

    // If HOD (not verifier), clear selection history
    if (!isVerifier) {
      updateData.$set[`${updatePath}.selected`] = [];
    }

    const updatedCandidate = await CandidateAdmission.findByIdAndUpdate(
      candidateId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedCandidate) {
      throw new Error('Failed to update candidate record');
    }

    res.status(200).json({
      success: true,
      message: `Selection updated successfully. Status reverted to ${targetStatus}`,
      status: targetStatus
    });

  } catch (error: any) {
    console.error('Error removing selection:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error while removing selection'
    });
  }
});
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// ++++++++++++++++++++++++Backup Database+++++++++++++++++++++++++++++
router.get("/database/backup", backupDatabaseJSON);
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// ++++++++++++++++++++++++Master Candidate Edit++++++++++++++++++++++++
router.get("/master-candidate-edit/:registrationNumber", getCandidateForEdit);
router.put("/master-candidate-edit/:registrationNumber", updateCandidateMaster);
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


//check the payment enable false 

router.get("/payment/initiate/false", async (req: Request, res: Response) => {
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error("Database connection not established");

    // ─── Step 1: Fetch all fee master records that need expiry date ───────────
    const pendingFeeRecords = await db
      .collection("candidate_fees_master")
      .find(
        {
          is_payment_enabled: false,
          payment_expiry_date: null,
        },
        {
          projection: {
            _id: 1,
            application_number: 1,
            registration_number: 1,
            fullName: 1,
            program_name: 1,
            total_amount: 1,
            status: 1,
          },
        }
      )
      .toArray();

    if (pendingFeeRecords.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No pending fee records without expiry date found.",
        updatedCount: 0,
        data: [],
      });
    }

    const applicationNumbers = pendingFeeRecords.map((r) => r.application_number);

    // ─── Step 2: Aggregate CandidateAdmission to get last_date from sms_history ─
    //
    // Match applications whose application_number is in our list,
    // and that have a fee_sms or admission_spot SMS entry with a last_date.
    // Pick the most recent sms_history entry per application_number.
    const admissionSmsData = await CandidateAdmission.aggregate([
      // Unwind so we can filter per application
      { $unwind: "$application_preferences.applications" },

      // Only care about applications in our pending list
      {
        $match: {
          "application_preferences.applications.application_number": {
            $in: applicationNumbers,
          },
        },
      },

      // Unwind sms_history so we can filter by template and pick last_date
      {
        $unwind: {
          path: "$application_preferences.applications.sms_history",
          preserveNullAndEmptyArrays: false,
        },
      },

      // Only sms entries with relevant templates AND a non-null last_date
      {
        $match: {
          "application_preferences.applications.sms_history.template_identifier": {
            $in: ["fee_sms", "admission_spot"],
          },
          "application_preferences.applications.sms_history.last_date": {
            $exists: true,
            $ne: null,
          },
        },
      },

      // Sort by sent_at descending so the latest SMS is first
      {
        $sort: {
          "application_preferences.applications.sms_history.sent_at": -1,
        },
      },

      // Group by application_number — take the first (latest) last_date
      {
        $group: {
          _id: "$application_preferences.applications.application_number",
          last_date: {
            $first:
              "$application_preferences.applications.sms_history.last_date",
          },
          sent_at: {
            $first:
              "$application_preferences.applications.sms_history.sent_at",
          },
          template_identifier: {
            $first:
              "$application_preferences.applications.sms_history.template_identifier",
          },
        },
      },
    ]);

    // Build a quick lookup map: application_number → last_date
    const expiryMap = new Map<number, Date>(
      admissionSmsData
        .filter((entry) => entry.last_date != null)
        .map((entry) => [entry._id as number, new Date(entry.last_date)])
    );

    // ─── Step 3: Update candidate_fees_master records that have a resolved date ─
    const updateResults: {
      application_number: number;
      fullName: string;
      payment_expiry_date: Date | null;
      updated: boolean;
      reason?: string;
    }[] = [];

    const bulkOps: mongoose.mongo.AnyBulkWriteOperation[] = [];

    for (const feeRecord of pendingFeeRecords) {
      const resolvedExpiry = expiryMap.get(feeRecord.application_number);

      if (!resolvedExpiry) {
        // No SMS entry found for this application — skip update
        updateResults.push({
          application_number: feeRecord.application_number,
          fullName: feeRecord.fullName,
          payment_expiry_date: null,
          updated: false,
          reason: "No matching SMS history with last_date found in CandidateAdmission",
        });
        continue;
      }

      bulkOps.push({
        updateOne: {
          filter: { application_number: feeRecord.application_number },
          update: {
            $set: {
              payment_expiry_date: resolvedExpiry,
              updatedAt: new Date(),
            },
          },
        },
      });

      updateResults.push({
        application_number: feeRecord.application_number,
        fullName: feeRecord.fullName,
        payment_expiry_date: resolvedExpiry,
        updated: true,
      });
    }

    // Execute bulk update if any
    let bulkWriteResult = null;
    if (bulkOps.length > 0) {
      bulkWriteResult = await db
        .collection("candidate_fees_master")
        .bulkWrite(bulkOps, { ordered: false });
    }

    // ─── Step 4: Return summary ───────────────────────────────────────────────
    const updatedRecords = updateResults.filter((r) => r.updated);
    const skippedRecords = updateResults.filter((r) => !r.updated);

    return res.status(200).json({
      success: true,
      message: `Processed ${pendingFeeRecords.length} records. Updated: ${updatedRecords.length}, Skipped: ${skippedRecords.length}.`,
      updatedCount: bulkWriteResult?.modifiedCount ?? 0,
      updated: updatedRecords,
      skipped: skippedRecords,
    });
  } catch (error: any) {
    console.error("[payment/initiate/false] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while processing payment expiry dates.",
      error: error.message,
    });
  }
});

// Script Routes
router.post("/scripts/fix-admission-dates", fixAdmissionDates);
router.post("/scripts/process-swipe-payments", processSwipePayments);

/**
 * @route GET /api/admin/admitted-candidates
 * @desc Get admitted candidates with options to filter by academic year, stream, and program code
 * @access Admin
 */
router.get("/admitted-candidates", async (req: Request, res: Response) => {
  try {
    const { academic_year, stream, program_code, shift } = req.query;

    const query: any = {};
    const elemMatch: any = { status: "ADMITTED" };

    if (stream) {
      elemMatch.stream = stream;
    }
    if (program_code) {
      elemMatch.program_code = program_code;
    }
    if (shift) {
      elemMatch.shift = shift;
    }

    query["application_preferences.applications"] = { $elemMatch: elemMatch };

    if (academic_year) {
      query.academic_year = academic_year;
    }

    const candidates = await CandidateAdmission.find(query);

    return res.status(200).json({
      success: true,
      total: candidates.length,
      data: candidates
    });
  } catch (error: any) {
    console.error("Error fetching admitted candidates:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching admitted candidates",
      error: error.message
    });
  }
});

/**
 * @route POST /api/admin/save-roll-numbers
 * @desc Bulk save roll numbers and section codes for admitted candidates
 * @access Admin
 */

// router.post("/save-roll-numbers", async (req: Request, res: Response) => {
//   try {
//     const { rollNumbers } = req.body; // Array of { registration_number, roll_number, section }

//     if (!rollNumbers || !Array.isArray(rollNumbers)) {
//       return res.status(400).json({
//         success: false,
//         message: "rollNumbers array is required"
//       });
//     }

//     const bulkOps = [];

//     for (const item of rollNumbers) {
//       const { registration_number, roll_number, section } = item;

//       if (!registration_number || !roll_number) {
//         continue;
//       }

//       bulkOps.push({
//         updateOne: {
//           filter: { registration_number: Number(registration_number) },
//           update: {
//             $set: {
//               roll_number: roll_number,
//               section: section || "",
//               "application_preferences.applications.$[elem].admission_details.roll_number": roll_number,
//               "application_preferences.applications.$[elem].admission_details.section": section || ""
//             }
//           },
//           arrayFilters: [{ "elem.status": "ADMITTED" }]
//         }
//       });
//     }

//     if (bulkOps.length > 0) {
//       const result = await CandidateAdmission.bulkWrite(bulkOps, { ordered: false });
//       return res.status(200).json({
//         success: true,
//         message: `Successfully updated ${result.modifiedCount} candidates with roll numbers.`,
//         modifiedCount: result.modifiedCount
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: "No records to update.",
//       modifiedCount: 0
//     });
//   } catch (error: any) {
//     console.error("Error saving roll numbers:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server error while saving roll numbers",
//       error: error.message
//     });
//   }
// });


// router.get("/checking/sms_history_morethan_1", async (req: Request, res: Response) => {
//   try {

//     const query = {
//       "application_preferences.applications": {
//         $elemMatch: {
//           program_code: "UG-BSC-CS",
//           status: "ADMITTED",
//           "sms_history.1": { $exists: true }
//         }
//       }
//     };

//     const data = await CandidateAdmission.find(
//       query,
//       {
//         registration_number: 1,
//         personal_details: 1,
//         "application_preferences.applications.$": 1
//       }
//     );

//     // Convert to CSV Format
//     const csvData = data.map((item: any) => {

//       const app = item.application_preferences?.applications?.[0];

//       return {
//         registration_number: item.registration_number,
//         full_name: item.personal_details?.fullName,
//         gender: item.personal_details?.gender,
//         phone: item.personal_details?.phone,
//         email: item.personal_details?.email,

//         application_number: app?.application_number,
//         program_code: app?.program_code,
//         program_name: app?.program_name,
//         stream: app?.stream,
//         shift: app?.shift,
//         status: app?.status,
//         transaction_id: app?.transaction_id,

//         sms_count: app?.sms_history?.length || 0,

//         first_sms_date: app?.sms_history?.[0]?.sent_at || "",
//         second_sms_date: app?.sms_history?.[1]?.sent_at || "",

//         first_sms_message: app?.sms_history?.[0]?.message || "",
//         second_sms_message: app?.sms_history?.[1]?.message || "",

//         admission_date: app?.admission_details?.admission_date || ""
//       };
//     });

//     const fields = [
//       "registration_number",
//       "full_name",
//       "gender",
//       "phone",
//       "email",
//       "application_number",
//       "program_code",
//       "program_name",
//       "stream",
//       "shift",
//       "status",
//       "transaction_id",
//       "sms_count",
//       "first_sms_date",
//       "second_sms_date",
//       "first_sms_message",
//       "second_sms_message",
//       "admission_date"
//     ];

//     const json2csvParser = new Parser({ fields });

//     const csv = json2csvParser.parse(csvData);

//     res.header("Content-Type", "text/csv");
//     res.attachment("sms_history_morethan_1.csv");

//     return res.send(csv);

//   } catch (error) {

//     console.error("CSV Export Error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Internal Server Error"
//     });

//   }
// });
router.get("/fullstats/count", getFullPaymentStats);
export default router;
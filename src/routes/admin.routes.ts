import { Request, Response, Router } from "express";
import CandidateAdmission from "../models/candidate.model";
import programsModel from "../models/programs.model";
import { getApplicationStats } from "../controllers/admin/stats.controller";
import { getProgrammeWiseStats } from "../controllers/admin/program.stats.controller";
import { getFullStatistics } from "../controllers/admin/full.stats.controller";
import {
  getNotification,
  createNotification,
  updateNotification,
  deleteNotification
} from "../controllers/admin/notification.controller";
import { backupDatabaseJSON } from "../controllers/admin/backup.controller";
import { updateCandidateMaster, getCandidateForEdit } from "../controllers/admin/masterADMCandidateEdit.controller";



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
            applications: "$application_preferences.applications"
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
router.put('/candidates/status/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const {
      status,
      remarks,
      program_code,
      application_number,
      interviewDate,
      user,
      stream,
      shift
    } = req.body;

    if (!program_code && !application_number) {
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

    const candidate = await CandidateAdmission.findById(candidateId);

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

    const targetApplication = candidate.application_preferences.applications[applicationIndex];

    const originalStream = targetApplication.stream;

    // Check if user is HOD
    const isHOD = user.designation?.toLowerCase().includes('hod') || 
                  (user.role && (Array.isArray(user.role) ? user.role : [user.role]).some((r: any) => r.toLowerCase().includes('hod')));

    let admissionStream = originalStream;
    let isStreamChanged = false;

    if (isHOD && stream && stream !== originalStream) {
      admissionStream = stream;
      isStreamChanged = true;
    }

    const updatedApplications = candidate.application_preferences.applications.map((app, index) => {

      if (index === applicationIndex) {

        const updatedApp: any = {
          ...(app.toObject ? app.toObject() : app),

          status: status,
          stream: admissionStream,
          shift: shift || app.shift,
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
              selected_by: {
                staff_id: user.staff_id,
                staff_name: user.name,
                department: user.department_code || user.department,
                designation: user.designation,
                selected_stream: admissionStream,
                selected_shift: shift || app.shift
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
      candidateId,
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
      app => app.program_code === program_code
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
          program: {
            program_code: program.program_code,
            program_name: program.program_name,
            department_name: program.department_name,
            stream: program.stream,
            shift: program.shift
          },
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
        program: {
          program_code: program.program_code,
          program_name: program.program_name,
          department_name: program.department_name,
          stream: program.stream,
          shift: program.shift
        },
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


router.get("/dashboard/stats", getApplicationStats);
router.get("/dashboard/programme-wise", getProgrammeWiseStats);
router.get("/dashboard/full-statistics", getFullStatistics);
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


export default router;
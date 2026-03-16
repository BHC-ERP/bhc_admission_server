import { Request, Response, Router } from "express";
import CandidateAdmission from "../models/candidate.model";
import programsModel from "../models/programs.model";


const router = Router();

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
            "application_preferences.applications.stream": stream
          }
        },

        {
          $project: {
            registration_number: 1,
            personal_details: 1,
            academic_background: 1,
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
      interviewDate,
      user, // User data passed in body
      selected_stream // Optional: stream to admit the candidate to
    } = req.body;

    // Validate required fields
    if (!program_code) {
      return res.status(400).json({
        success: false,
        message: 'Program code is required'
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

    // Validate required user fields
    if (!user.staff_id || !user.name || !user.stream || !user.shift) {
      return res.status(400).json({
        success: false,
        message: 'User must contain staff_id, name, stream, and shift'
      });
    }

    // Validate status enum
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

    // Valid stream values in enum
    const validStreamValues = ['Aided', 'Self-Finance'];

    // Check if user stream is valid
    if (!validStreamValues.includes(user.stream)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stream value: '${user.stream}'. Must be one of: ${validStreamValues.join(', ')}`
      });
    }

    // If selected_stream is provided, validate it
    if (selected_stream && !validStreamValues.includes(selected_stream)) {
      return res.status(400).json({
        success: false,
        message: `Invalid selected_stream value: '${selected_stream}'. Must be one of: ${validStreamValues.join(', ')}`
      });
    }

    // Valid shift values
    const validShiftValues = ['Shift-1', 'Shift-2'];

    // Check if user shift is valid
    if (!validShiftValues.includes(user.shift)) {
      return res.status(400).json({
        success: false,
        message: `Invalid shift value: '${user.shift}'. Must be one of: ${validShiftValues.join(', ')}`
      });
    }

    const currentDate = new Date();

    // Find candidate first
    const candidate = await CandidateAdmission.findById(candidateId);

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    // Safe check for application_preferences
    if (!candidate.application_preferences) {
      return res.status(400).json({
        success: false,
        message: 'Candidate has no application preferences'
      });
    }

    if (!candidate.application_preferences.applications || candidate.application_preferences.applications.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Candidate has no applications'
      });
    }

    // Find the application with matching program_code
    const applicationIndex = candidate.application_preferences.applications.findIndex(
      app => app.program_code === program_code
    );

    if (applicationIndex === -1) {
      return res.status(400).json({
        success: false,
        message: `Program code ${program_code} not found in candidate's applications`
      });
    }

    // Get the specific application
    const targetApplication = candidate.application_preferences.applications[applicationIndex];

    // Store original stream for reference
    const originalStream = targetApplication.stream;

    // Determine which stream to use for admission
    // Use selected_stream if provided, otherwise fall back to user.stream
    const admissionStream = selected_stream || user.stream;

    // Check if we're admitting to a different stream than applied
    const isStreamChanged = originalStream !== admissionStream;

    // Validate that the admission stream matches user's stream
    if (admissionStream !== user.stream) {
      return res.status(400).json({
        success: false,
        message: `Stream mismatch: You are trying to admit to '${admissionStream}' but your stream is '${user.stream}'. You can only admit candidates to your own stream.`
      });
    }

    // Optional: Check shift as well (keeping this as a warning rather than error if you want to allow shift changes)
    if (targetApplication.shift && targetApplication.shift !== user.shift) {
      // You can either block shift mismatches or just log them
      console.log(`Shift mismatch: Application shift is '${targetApplication.shift}' but user shift is '${user.shift}'`);
      // Uncomment below if you want to block shift mismatches
      // return res.status(400).json({
      //   success: false,
      //   message: `Shift mismatch: Application shift is '${targetApplication.shift}' but user shift is '${user.shift}'. You can only select candidates for your shift.`
      // });
    }

    // Update the specific application
    const updatedApplications = candidate.application_preferences.applications.map((app, index) => {
      if (index === applicationIndex) {
        // Base application update for all statuses
        const updatedApp: any = {
          ...(app.toObject ? app.toObject() : app), // Handle both Mongoose doc and plain object
          status: status,
          // Use admissionStream for the final admission stream
          stream: admissionStream, // Update the stream to the admission stream
          original_stream: isStreamChanged ? originalStream : undefined, // Store original stream if changed
          staff_id: user.staff_id,
          staff_name: user.name,
          staff_department: user.department_code || user.department,
          selection_date: currentDate,
          selection_remarks: remarks || ''
        };

        // Add stream change information in remarks if changed
        if (isStreamChanged) {
          const streamChangeNote = `[Stream Changed: Applied for ${originalStream}, Admitted to ${admissionStream}]`;
          updatedApp.selection_remarks = updatedApp.selection_remarks
            ? `${streamChangeNote} ${updatedApp.selection_remarks}`
            : streamChangeNote;

          // Also store in a dedicated field for easy tracking
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

        // Add interview details only if status is HOD_SELECTION_INTERVIEW
        if (status === 'HOD_SELECTION_INTERVIEW') {
          if (interviewDate) {
            updatedApp.interview_details = {
              scheduled_date: interviewDate,
              status: 'Scheduled',
              scheduled_by: user.name,
              scheduled_by_id: user.staff_id,
              scheduled_at: currentDate
            };
          } else {
            // If no interview date, just mark as interview requested
            updatedApp.interview_requested = true;
            updatedApp.interview_status = 'Pending Scheduling';
          }
        }

        return updatedApp;
      }
      return app;
    });

    // Update only the applications array
    const updatedCandidate = await CandidateAdmission.findByIdAndUpdate(
      candidateId,
      {
        $set: {
          'application_preferences.applications': updatedApplications,
          'updatedAt': currentDate
        }
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedCandidate) {
      return res.status(404).json({
        success: false,
        message: 'Failed to update candidate'
      });
    }

    // Find the updated application to return
    const updatedApplication = updatedCandidate.application_preferences?.applications?.find(
      app => app.program_code === program_code
    );

    // Success response with stream change info
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
        application: updatedApplication,
        stream_info: {
          applied_stream: originalStream,
          admitted_stream: admissionStream,
          is_stream_changed: isStreamChanged
        },
        staff_info: {
          staff_id: user.staff_id,
          staff_name: user.name,
          stream: user.stream,
          shift: user.shift,
          department: user.department_code || user.department,
          designation: user.designation
        },
        updated_at: currentDate
      }
    });

  } catch (error: any) {
    console.error('Error updating candidate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update candidate status',
      error: error?.message || 'Unknown error'
    });
  }
});

export default router;
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
      user,
      selected_stream
    } = req.body;

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

    if (!user.staff_id || !user.name || !user.stream || !user.shift) {
      return res.status(400).json({
        success: false,
        message: 'User must contain staff_id, name, stream, and shift'
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

    const validStreamValues = ['Aided', 'Self-Finance'];

    if (!validStreamValues.includes(user.stream)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stream value: '${user.stream}'`
      });
    }

    if (selected_stream && !validStreamValues.includes(selected_stream)) {
      return res.status(400).json({
        success: false,
        message: `Invalid selected_stream value`
      });
    }

    const validShiftValues = ['Shift-1', 'Shift-2'];

    if (!validShiftValues.includes(user.shift)) {
      return res.status(400).json({
        success: false,
        message: `Invalid shift value`
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
      app => app.program_code === program_code
    );

    if (applicationIndex === -1) {
      return res.status(400).json({
        success: false,
        message: `Program code ${program_code} not found`
      });
    }

    const targetApplication = candidate.application_preferences.applications[applicationIndex];

    const originalStream = targetApplication.stream;

    const admissionStream = selected_stream || user.stream;

    const isStreamChanged = originalStream !== admissionStream;

    if (admissionStream !== user.stream) {
      return res.status(400).json({
        success: false,
        message: `You can only admit candidates to your own stream`
      });
    }

    const updatedApplications = candidate.application_preferences.applications.map((app, index) => {

      if (index === applicationIndex) {

        const updatedApp: any = {
          ...(app.toObject ? app.toObject() : app),

          status: status,
          stream: admissionStream,
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
                selected_stream: admissionStream,
                staff_id: user.staff_id,
                staff_name: user.name,
                stream: user.stream,
                shift: user.shift,
                department: user.department_code || user.department,
                designation: user.designation
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

export default router;
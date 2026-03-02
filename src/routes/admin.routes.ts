import { Request, Response, Router } from "express";
import CandidateAdmission from "../models/candidate.model";
import programsModel from "../models/programs.model";


const router = Router();

/**
 * GET Applications by Department + Program Code
 * Example:
 * /api/applications/UG/UG-BSC-ND
 */
router.get(
  "/applications/:departmentCode/:programCode",
  async (req: Request, res: Response) => {
    try {
      const { departmentCode, programCode } = req.params;

      /* -------------------------------------------------
         STEP 1: Check Program exists under department
      ------------------------------------------------- */

      const program = await programsModel.findOne({
        department_code: departmentCode,
        program_code: programCode,
        show: true
      });

      if (!program) {
        return res.status(400).json({
          success: false,
          message: "Invalid department code or program code"
        });
      }

      /* -------------------------------------------------
         STEP 2: Fetch Applications
      ------------------------------------------------- */

      const applications = await CandidateAdmission.find(
        {
          "application_preferences.applications": {
            $elemMatch: {
              program_code: programCode
            }
          }
        },
        {
          registration_number: 1,
          personal_details: 1,
          academic_background: 1, 
          documents: 1, 
          "application_preferences.applications.$": 1
        }
      );

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



export default router;
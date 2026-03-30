// import { Router } from "express";
// import {
//     getApplicationsByProgramAndStream,
//     updateCandidateStatus,
//     getSelectedApplicationsByProgramAndStream,
//     getApplicationStatsController,
//     getProgrammeWiseStatsController
// } from "../../controllers/applicaitonForm/application.controller";

// const router = Router();

// /**
//  * @route GET /api/applications/:programCode/:stream
//  * @desc Get applications by program code and stream
//  * @access Public
//  */
// router.get("/applications/:programCode/:stream", getApplicationsByProgramAndStream);

// /**
//  * @route PUT /api/admin/candidates/status/:candidateId
//  * @desc Update single candidate application status
//  * @access Private (Admin/HOD)
//  */
// router.put("/candidates/status/:candidateId", updateCandidateStatus);

// /**
//  * @route GET /api/applications/selected/:programCode/:stream
//  * @desc Get selected applications by program code and stream with filters
//  * @access Private (Admin/HOD)
//  */
// router.get("/applications/selected/:programCode/:stream", getSelectedApplicationsByProgramAndStream);

// /**
//  * @route GET /api/dashboard/stats
//  * @desc Get application statistics for dashboard
//  * @access Private (Admin)
//  */
// router.get("/dashboard/stats", getApplicationStatsController);

// /**
//  * @route GET /api/dashboard/programme-wise
//  * @desc Get programme-wise statistics
//  * @access Private (Admin)
//  */
// router.get("/dashboard/programme-wise", getProgrammeWiseStatsController);

// export default router;
import { Router } from "express";
import { shiftTransfer, streamTransfer, courseTransfer, getApplicationDetails } from "../controllers/admin/transferCandidate.controller";

const router = Router();

/**
 * @route PUT /api/transfer/shift
 * @desc Transfer candidate shift
 */
router.put("/shift", shiftTransfer);

/**
 * @route PUT /api/transfer/stream
 * @desc Transfer candidate stream
 */
router.put("/stream", streamTransfer);

/**
 * @route PUT /api/transfer/course
 * @desc Transfer candidate course/program
 */
router.put("/course", courseTransfer);

/**
 * @route GET /api/transfer/details/:appNo
 * @desc Get application details for transfer
 */
router.get("/details/:appNo", getApplicationDetails);

export default router;

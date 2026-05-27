import { Router } from "express";
import {
  bulkMigrate,
  listEnrolled,
  saveRollNumbers,
} from "../controllers/admin/studentEnroll.controller";

const router = Router();

router.post("/bulk-migrate", bulkMigrate);
router.get("/", listEnrolled);
router.post("/save", saveRollNumbers);

export default router;

import { Router } from "express";
import {
  candidateLogin,
  candidateSignup,
  departmentLogin,
  findRegistrationNumber,
  logout,
  paymentSimulation
} from "../controllers/auth/auth.controller";

const router = Router();

// Candidate routes
router.post("/login", candidateLogin);
router.post("/signup", candidateSignup);
router.post("/forgot-registration", findRegistrationNumber);
router.post("/logout", logout);

router.post("/simulate-payment", paymentSimulation);
// Department routes
router.post("/department/login", departmentLogin);

export default router;
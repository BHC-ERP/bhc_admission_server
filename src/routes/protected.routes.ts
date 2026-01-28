import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.get("/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: "Welcome to dashboard",
    user: req.user,
  });
});

export default router;

import { Router } from "express";
import { signToken } from "../utils/jwt";

const router = Router();

router.post("/login", async (req, res) => {
  const { email } = req.body;

  // 🔴 Replace with DB check
  const user = {
    id: "123",
    email:' email,',
    role: "admin",
  };

  // JWT
  const token = signToken(user);

  // Session
  req.session.user = user;

  res.json({
    message: "Login successful",
    token,
    user,
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ message: "Logged out successfully" });
  });
});

export default router;

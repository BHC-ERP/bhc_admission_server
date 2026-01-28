import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGO_URI: process.env.MONGO_URI || "",
  JWT_SECRET: process.env.JWT_SECRET || "super_secret_key",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
  SESSION_SECRET: process.env.SESSION_SECRET || "session_secret_key",
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
};

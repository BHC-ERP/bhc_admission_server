import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGO_URI: process.env.MONGO_URI!,
  MONGO_URI_HEBER_DB: process.env.MONGO_URI_HEBER_DB || "",
  JWT_SECRET: process.env.JWT_SECRET || "super_secret_key",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
  SESSION_SECRET: process.env.SESSION_SECRET || "session_secret_key",
  CLIENT_URL: process.env.CLIENT_URL!,
  BASE_URL: process.env.BASE_URL!,
  MAIL_USER: process.env.MAIL_USER || 'bishophebercollegeweb@gmail.com',
  MAIL_PASS: process.env.MAIL_PASS || 'qnxcfbldushagbih',
  CCAVENUE_MERCHANT_ID: process.env.CCAVENUE_MERCHANT_ID!,
  CCAVENUE_ACCESS_CODE: process.env.CCAVENUE_ACCESS_CODE!,
  CCAVENUE_WORKING_KEY: process.env.CCAVENUE_WORKING_KEY!,
  CCAVENUE_PAYMENT_URL: process.env.CCAVENUE_PAYMENT_URL || 'https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173'
};

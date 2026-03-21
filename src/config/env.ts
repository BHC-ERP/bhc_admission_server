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
  SMS_BASE_URL: process.env.SMS_BASE_URL || 'http://182.18.163.39/v3/api.php',
  SMS_USERNAME: process.env.SMS_USERNAME || 'bishopheber',
  SMS_API_KEY: process.env.SMS_API_KEY || '55a68eb05c87e78eaa2f',
  SMS_SENDER_ID: process.env.SMS_SENDER_ID || 'BHCCOL',
  CCAVENUE_MERCHANT_ID: process.env.CCAVENUE_MERCHANT_ID!,
  CCAVENUE_ACCESS_CODE: process.env.CCAVENUE_ACCESS_CODE!,
  CCAVENUE_WORKING_KEY: process.env.CCAVENUE_WORKING_KEY!,
  CCAVENUE_PAYMENT_URL: process.env.CCAVENUE_PAYMENT_URL!,
  CCAVENUE_FRONTEND_URL: process.env.CCAVENUE_FRONTEND_URL!,
  CCAVENUE_MERCHANT_ID_DEV: process.env.CCAVENUE_MERCHANT_ID_DEV!,
  CCAVENUE_ACCESS_CODE_DEV: process.env.CCAVENUE_ACCESS_CODE_DEV!,
  CCAVENUE_WORKING_KEY_DEV: process.env.CCAVENUE_WORKING_KEY_DEV!,
  CCAVENUE_PAYMENT_URL_DEV: process.env.CCAVENUE_PAYMENT_URL_DEV!,
  CCAVENUE_FRONTEND_URL_DEV: process.env.CCAVENUE_FRONTEND_URL_DEV!
};




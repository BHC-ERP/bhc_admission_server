import nodemailer from "nodemailer";
import { env } from "../config/env";

export const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

export const sendOtpMail = async (to: string, otp: string) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: env.MAIL_USER,
      pass: env.MAIL_PASS,
    },
  });

  const htmlTemplate = `
  <div style="font-family: Arial, Helvetica, sans-serif; background-color:#f4f6f8; padding:30px;">
    <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.08)">
      
      <!-- Header -->
      <div style="background:#0b3c5d; color:#ffffff; padding:20px; text-align:center;">
        <h2 style="margin:0;">Bishop Heber College</h2>
        <p style="margin:6px 0 0; font-size:14px;">
          Admission & ERP Portal
        </p>
      </div>

      <!-- Body -->
      <div style="padding:30px; color:#333;">
        <p style="font-size:16px;">Dear Faculty,</p>

        <p style="font-size:15px; line-height:1.6;">
          You have requested to log in to the 
          <b>Heber Admission Portal</b>.
          Please use the One-Time Password (OTP) below to continue.
        </p>

        <!-- OTP Box -->
        <div style="
          margin:30px auto;
          text-align:center;
          font-size:32px;
          letter-spacing:6px;
          font-weight:bold;
          color:#0b3c5d;
          background:#eef4f8;
          padding:15px;
          border-radius:6px;
          width: fit-content;
        ">
          ${otp}
        </div>

        <p style="font-size:14px; color:#555;">
          ⏱ <b>This OTP is valid for 5 minutes only.</b>
        </p>

        <p style="font-size:14px; line-height:1.6;">
          If you did not initiate this login request, please ignore this email.
          For security reasons, do not share your OTP with anyone.
        </p>

        <p style="margin-top:30px; font-size:14px;">
          Regards,<br/>
          <b>Heber ERP Team</b><br/>
          Bishop Heber College
        </p>
      </div>

      <!-- Footer -->
      <div style="background:#f0f0f0; padding:15px; text-align:center; font-size:12px; color:#777;">
        This is an automated email. Please do not reply.
      </div>

    </div>
  </div>
  `;

  await transporter.sendMail({
    from: `"Heber ERP" <${env.MAIL_USER}>`,
    to,
    subject: "OTP for Admission Login - BHC",
    html: htmlTemplate,
  });
};

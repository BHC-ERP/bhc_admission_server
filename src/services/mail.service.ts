import nodemailer from "nodemailer";
import { env } from "../config/env";

export const sendMailService = async (
    to: string,
    regNo: string,
    password: string
): Promise<void> => {
    try {
        console.log("========== 📧 MAIL SERVICE START ==========");
        console.log("➡️ TO:", to);
        console.log("➡️ REG NO:", regNo);

        /* =========================
           ENV DEBUG
        ========================= */
        console.log("➡️ MAIL USER:", env.MAIL_USER);
        console.log("➡️ MAIL PASS EXISTS:", !!env.MAIL_PASS);

        if (!env.MAIL_USER || !env.MAIL_PASS) {
            throw new Error("MAIL_USER or MAIL_PASS missing in .env");
        }

        /* =========================
           CREATE TRANSPORTER
        ========================= */
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: env.MAIL_USER,
                pass: env.MAIL_PASS,
            },
        });

        /* =========================
           VERIFY CONNECTION
        ========================= */
        await transporter.verify();
        console.log("✅ Mail transporter verified (Gmail ready)");

        /* =========================
           HTML TEMPLATE
        ========================= */
        const htmlTemplate = `
        <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:20px;">
          <div style="max-width:600px; margin:auto; background:white; border-radius:10px; overflow:hidden; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
            
            <div style="background:#2c3e50; color:white; padding:20px; text-align:center;">
              <h2 style="margin:0;">Bishop Heber College</h2>
              <p style="margin:5px 0 0;">Admission Confirmation</p>
            </div>

            <div style="padding:25px;">
              <h3 style="color:#333;">Dear Candidate,</h3>

              <p style="color:#555; font-size:15px;">
                We are pleased to inform you that your registration has been successfully completed.
              </p>

              <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin:20px 0;">
                <p><strong>Registration No:</strong> ${regNo}</p>
                <p><strong>Password:</strong> ${password}</p>
              </div>

              <p style="color:#555; font-size:14px;">
                Please keep this information safe for future login and reference.
              </p>

              <p style="margin-top:20px;">
                Regards,<br/>
                <strong>Bishop Heber College</strong>
              </p>
            </div>

            <div style="background:#ecf0f1; padding:10px; text-align:center; font-size:12px; color:#777;">
              © ${new Date().getFullYear()} Bishop Heber College
            </div>

          </div>
        </div>
        `;

        /* =========================
           MAIL OPTIONS
        ========================= */
        const mailOptions = {
            from: `"Bishop Heber College" <${env.MAIL_USER}>`,
            to,
            subject: "🎓 Registration Successful - Bishop Heber College",
            html: htmlTemplate,
        };

        console.log("➡️ Sending mail...");

        /* =========================
           SEND MAIL
        ========================= */
        const response = await transporter.sendMail(mailOptions);

        console.log("✅ Mail Sent Successfully");
        console.log("📧 Message ID:", response.messageId);
        console.log("📬 Response:", response);

        console.log("========== ✅ MAIL SERVICE END ==========");

    } catch (error: any) {
        console.error("========== ❌ MAIL ERROR ==========");
        console.error("❌ Message:", error.message);

        if (error.response) {
            console.error("❌ Response:", error.response);
        }

        if (error.stack) {
            console.error("❌ Stack:", error.stack);
        }

        console.error("=================================");
    }
};
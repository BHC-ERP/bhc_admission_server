import payment_log from "../models/audit/payment_log";

export const createPaymentAuditLog = async (data: {
    personal_details: any;
    selected_courses: any[];
    payment_details: any;
    step_completed?: number;
}) => {
    try {
        const log = await payment_log.create({
            personal_details: data.personal_details,
            selected_courses: data.selected_courses,
            payment_details: data.payment_details,
            step_completed: data.step_completed
        });

        console.log("📝 Payment Audit Log Saved:", log._id);

        return log;

    } catch (error) {
        console.error("❌ Failed to save audit log:", error);
    }
};
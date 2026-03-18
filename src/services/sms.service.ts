import axios from "axios";
import { env } from "../config/env";

export const sendSMSService = async (
    mobile: string,
    message: string
): Promise<void> => {
    try {
        const url = `${env.SMS_BASE_URL}?username=${env.SMS_USERNAME}&apikey=${env.SMS_API_KEY}&senderid=${env.SMS_SENDER_ID}&mobile=${mobile}&message=${encodeURIComponent(
            message
        )}`;

        const response = await axios.get(url);

        console.log("📩 SMS Sent:", response.data);
    } catch (error: any) {
        console.error("❌ SMS Failed:", error.message);
        // DO NOT throw (important)
    }
};
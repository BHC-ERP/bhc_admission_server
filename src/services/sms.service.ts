import axios from "axios";
import { env } from "../config/env";


export const sendSMSService = async (
    mobile: string,
    message: string
): Promise<void> => {
    try {
        console.log("BASE URL:", env.SMS_BASE_URL);

        const response = await axios.get(env.SMS_BASE_URL, {
            params: {
                username: env.SMS_USERNAME,
                apikey: env.SMS_API_KEY,
                senderid: env.SMS_SENDER_ID,
                mobile: mobile,
                message: message, // axios handles encoding
            },
        });

        console.log("📩 SMS Sent:", response.data);
    } catch (error: any) {
        console.error("❌ SMS Failed:", error.message);
        throw new Error(error.message);
    }
};
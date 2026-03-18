import axios from "axios";

export const sendSMSService = async (
    mobile: string,
    message: string
): Promise<void> => {
    try {
        const url = `${process.env.SMS_BASE_URL}?username=${process.env.SMS_USERNAME}&apikey=${process.env.SMS_API_KEY}&senderid=${process.env.SMS_SENDER_ID}&mobile=${mobile}&message=${encodeURIComponent(
            message
        )}`;

        const response = await axios.get(url);

        console.log("📩 SMS Sent:", response.data);
    } catch (error: any) {
        console.error("❌ SMS Failed:", error.message);
        // DO NOT throw (important)
    }
};
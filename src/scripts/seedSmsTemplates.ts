import mongoose from "mongoose";
import dotenv from "dotenv";
import SmsTemplate from "../models/smsTemplate.model";

dotenv.config();

const templates = [
    {
        identifier: "admission_spot",
        title: "ADMISSION-SPOT-UG-PG-26-27",
        message: "Dear {#var#}, Your Application Number: {#var#} is provisionally selected for Admission in {#var#} {#var#}. Pay the Fee ₹. {#var#} through online by Logging in with Reg.No. and Mobile No. or Swipe Machine at the College Office today before 5PM. Principal, Bishop Heber College.",
        fields: ["Student Name", "Application Number", "Course", "Category", "Fee Amount"]
    },
    {
        identifier: "ug_interview",
        title: "UG -INTERVIEW-26-27",
        message: "Dear Applicant {#var#}, You are shortlisted for written test/ personal interview for {#var#} in {#var#} on {#var#}. If selected for admission, submit original X mark sheet and pay fee {#var#} immediately through online. Principal, Bishop Heber College.",
        fields: ["Student Name", "Admission Type", "Department", "Interview Date", "Fee Amount"]
    },
    {
        identifier: "mba_mca",
        title: "INTERVIEW MBA_MCA_ADMISSION_INFO_26_27",
        message: "Dear Applicant {#var#}, your application is shortlisted for {#var#} and you have to appear for Group Discussion/ Technical/ Personal Interview to be held on {#var#} in Bishop Heber College. You have to bring TANCET mark sheet and original mark sheets upto 5th semester. Principal, Bishop Heber College.",
        fields: ["Student Name", "Course", "Interview Date"]
    },
    {
        identifier: "others_interview",
        title: "INTERVIEW_OTHERS_ADMISSION_INFO_26_27",
        message: "Dear Applicant {#var#}, your application is shortlisted for {#var#} and you have to appear for Group Discussion/ Technical/ Personal Interview to be held on {#var#} in Bishop Heber College. You have to bring original mark sheets upto 5th semester. Principal, Bishop Heber College.",
        fields: ["Student Name", "Course", "Interview Date"]
    },
    {
        identifier: "fee_sms",
        title: "ADMISSION SELECT_FEE_SMS_26_27",
        message: "Dear {#var#}, Your Application Number: {#var#} is Provisionally selected for Admission in {#var#} {#var#}. Pay the Fee Online by Logging in with Reg.No. and Mobile No. Fee Payable is {#var#} on or before {#var#}, 5PM. Principal, Bishop Heber College",
        fields: ["Student Name", "Application Number", "Course", "Category", "Fee Amount", "Last Date"]
    }
];

const seedSmsTemplates = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/bhc_admission";
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB");

        for (const template of templates) {
            await SmsTemplate.findOneAndUpdate(
                { identifier: template.identifier },
                template,
                { upsert: true, new: true }
            );
            console.log(`Seeded/Updated template: ${template.identifier}`);
        }

        console.log("SMS Templates seeding completed!");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding SMS templates:", error);
        process.exit(1);
    }
};

seedSmsTemplates();

import mongoose from "mongoose";

const SmsTemplateSchema = new mongoose.Schema({
    identifier: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    fields: [String],
    active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("SmsTemplate", SmsTemplateSchema);

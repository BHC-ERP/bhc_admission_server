import mongoose, { Schema, Document } from "mongoose";

export interface IEditLog extends Document {
    registration_number: number;
    staff_id: string;
    staff_name: string;
    section_edited: string; // e.g., "Basic Details"
    old_data: any;
    new_data: any;
    ip_address: string;
    user_agent: string;
    createdAt: Date;
    updatedAt: Date;
}

const EditLogSchema = new Schema<IEditLog>(
    {
        registration_number: {
            type: Number,
            required: true,
            index: true
        },
        staff_id: {
            type: String,
            required: true,
            index: true
        },
        staff_name: {
            type: String,
            required: true
        },
        section_edited: {
            type: String,
            required: true
        },
        old_data: {
            type: Schema.Types.Mixed
        },
        new_data: {
            type: Schema.Types.Mixed,
            required: true
        },
        ip_address: {
            type: String
        },
        user_agent: {
            type: String
        }
    },
    {
        timestamps: true,
        collection: "edit_logs"
    }
);

export default mongoose.model<IEditLog>("EditLog", EditLogSchema);

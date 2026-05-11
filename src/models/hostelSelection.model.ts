import mongoose, { Schema, Document } from "mongoose";

export interface IHostelSelection extends Document {
    registration_number: string;
    application_number: number;
    hostel_id?: mongoose.Types.ObjectId;
    room_type?: string;
    status: 'PENDING' | 'SELECTED' | 'REJECTED' | 'PAID';
    selected_at?: Date;
    selected_by?: {
        staff_id: string;
        staff_name: string;
        department: string;
        stream: string;
    };
    academic_year: string;
}

const HostelSelectionSchema = new Schema<IHostelSelection>({
    registration_number: { type: String, required: true },
    application_number: { type: Number, required: true, unique: true },
    hostel_id: { type: Schema.Types.ObjectId, ref: 'Hostel' },
    room_type: { type: String },
    status: { type: String, enum: ['PENDING', 'SELECTED', 'REJECTED', 'PAID'], default: 'PENDING' },
    selected_at: { type: Date },
    selected_by: {
        staff_id: { type: String },
        staff_name: { type: String },
        department: { type: String },
        stream: { type: String }
    },
    academic_year: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model<IHostelSelection>("HostelSelection", HostelSelectionSchema, 'hostel_selections');

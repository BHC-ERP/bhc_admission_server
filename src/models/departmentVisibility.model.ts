import mongoose from "mongoose";

const DepartmentVisibilitySchema = new mongoose.Schema({
    department_code: {
        type: String,
        required: true,
    },
    stream: {
        type: String,
        required: true,
    },
    allowed_departments: [String],
    allowed_stream: {
        type: String,
        default: 'Both'
    },
    max_percentage: {
        type: Number,
        default: null
    }
}, { timestamps: true });

DepartmentVisibilitySchema.index({ department_code: 1, stream: 1 }, { unique: true });

export default mongoose.model("DepartmentVisibility", DepartmentVisibilitySchema);

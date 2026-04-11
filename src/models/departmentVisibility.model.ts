import mongoose from "mongoose";

const DepartmentVisibilitySchema = new mongoose.Schema({
    department_code: {
        type: String,
        required: true,
        unique: true
    },
    allowed_departments: [String]
}, { timestamps: true });

export default mongoose.model("DepartmentVisibility", DepartmentVisibilitySchema);

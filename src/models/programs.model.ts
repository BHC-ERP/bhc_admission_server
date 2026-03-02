import mongoose from "mongoose";

const ProgrammeSchema = new mongoose.Schema({
    program_code: String,
    program_name: String,
    department_code: String,
    type: {
        type: String,
        enum: ['Arts', 'Sciences']
    },
    program_type: {
        type: String,
        enum: ['UG', 'PG']
    }, 
    department_name: {
        type: String, 
    },
    special: {
        type: String,
        enum: ['AICTE'],
        default: null
    },
    show: {
        type: Boolean,
        default: true
    },
    stream: {
        type: String,
        enum: ['Aided', 'Self-Financed']
    },
    shift: {
        type: String,
        enum: ['Shift-1', 'Shift-2']
    },
    sanctioned_strength: Number
}, { timestamps: true });

export default mongoose.model("Program", ProgrammeSchema);

import { Schema, model, Document } from "mongoose";
import { CandidateDocument } from "../types/candidate.types";


/**
 * Candidate Schema
 */
const CandidateSchema = new Schema<CandidateDocument>(
    {
        firstName: {
            type: String,
            required: true,
            trim: true,
        },

        lastName: {
            type: String,
            required: true,
            trim: true,
        },

        fullName: {
            type: String,
            required: true,
            index: true,
        },

        email: {
            type: String,
            lowercase: true,
            trim: true,
        },

        mobileNumber: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },

        status: {
            type: String,
            enum: ["active", "inactive", "blocked"],
            default: "active",
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

/**
 * Auto-generate fullName before save
 */
CandidateSchema.pre("save", async function () {
    if (!this.firstName || !this.lastName) {
        throw new Error("First name and last name are required");
    }

    this.fullName = `${this.firstName} ${this.lastName}`;
});


/**
 * Export Model
 */
export const CandidateModel = model<CandidateDocument>(
    "Candidate",
    CandidateSchema
);

import mongoose, { Schema, Document } from "mongoose";

export interface CollegeDocument extends Document {
  university: string;
  college: string;
  college_type: string;
  state: string;
  district: string;
}

const CollegeSchema = new Schema<CollegeDocument>(
  {
    university: {
      type: String,
      required: true,
      trim: true,
    },

    college: {
      type: String,
      required: true,
      trim: true,
    },

    college_type: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    district: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    collection: "college_location", // 🔴 IMPORTANT: match your existing collection name
    timestamps: false,       // since your document has no createdAt/updatedAt
  }
);

export default mongoose.model<CollegeDocument>(
  "College",
  CollegeSchema
);

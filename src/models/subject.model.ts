import mongoose, { Schema, Document } from "mongoose";

export interface ISubject extends Document {
  subjects: string[];
}

const SubjectSchema = new Schema<ISubject>(
  {
    subjects: [{ type: String }]
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export default mongoose.model<ISubject>("subject", SubjectSchema, 'subjects_list');

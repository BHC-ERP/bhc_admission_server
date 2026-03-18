import mongoose, { Schema, Document } from "mongoose";

export interface IDiocese extends Document {
  name: string;
  state: string;
  sub_domain: string;
}

const DioceseSchema = new Schema<IDiocese>(
  {
    name: { type: String, required: true },
    state: { type: String, required: true },
    sub_domain: { type: String, required: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export default mongoose.model<IDiocese>("diocese", DioceseSchema, 'diocese_list');

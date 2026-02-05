import mongoose, { Schema, Document } from "mongoose";

/* Sub-caste interface */
interface ICasteItem {
  id: string;
  name: string;
}

/* Main caste interface */
export interface ICaste extends Document {
  id: string;
  name: string;
  castealias: string;
  castes: ICasteItem[];
}

/* Sub-caste schema */
const CasteItemSchema = new Schema<ICasteItem>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true }
  },
  { _id: false } // prevents auto _id for each caste item
);

/* Main caste schema */
const CasteSchema = new Schema<ICaste>(
  {
    id: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    castealias: {
      type: String,
      required: true
    },
    castes: {
      type: [CasteItemSchema],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export default mongoose.model<ICaste>("caste", CasteSchema, 'caste_list');

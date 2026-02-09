import mongoose from "mongoose";

const CountrySchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true
    },
    iso2: {
      type: String,
      required: true,
      maxlength: 2
    },
    iso3: {
      type: String,
      required: true,
      maxlength: 3
    },
    phonecode: {
      type: String,
      required: true
    },
    capital: {
      type: String
    },
    currency: {
      type: String,
      maxlength: 3
    },
    native: {
      type: String
    },
    emoji: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Country", CountrySchema);

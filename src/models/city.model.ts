import mongoose from "mongoose";

const CityPincodeSchema = new mongoose.Schema(
  {
    pincode: {
      type: Number,
      required: true,
      index: true
    },
    sub_city: {
      type: String
    },
    city: {
      type: String,
      required: true,
      index: true
    },
    state_name: {
      type: String,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);
 

export default mongoose.model("CityPincode", CityPincodeSchema);

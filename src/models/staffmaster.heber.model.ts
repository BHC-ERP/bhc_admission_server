import { Schema } from "mongoose"; 
import { heberConnection } from "../config/heber.db";

// reuse your existing schema definition
const StaffSchema = new Schema({}, { strict: false });
// strict:false allows OTP fields without schema changes

const StaffModel = heberConnection.model(
  "staffmasters",
  StaffSchema,
  "staffmasters"
);

export default StaffModel;

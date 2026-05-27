import mongoose from "mongoose";

const EnrolledStudentSchema = new mongoose.Schema({
  registration_number: Number,
  application_no: { type: Number, unique: true, sparse: true },
  roll_no: Number,
  admission_number: Number,
  name: String,
  college_id: mongoose.Schema.Types.Mixed,
  stream: String,
  shift: String,
  admission_date: Date,
  batch: String,
  photo: { type: String, default: "" },
  personal_info: {
    dob: Date,
    gender: String,
    blood_group: String,
    nationality: String,
    religion: String,
    community: String,
    caste: String,
    denom: String,
    denom_group: String,
    diocese: String,
    aadhar: String,
    passport_number: String,
    epic_voter_no: String,
    first_graduation: Boolean,
    physically_challenged: Boolean,
    disability_type: String,
    disability_percent: String,
    mother_tongue: String,
    family: {
      ex_service: Boolean,
      ex_grade: String,
      father: {
        name: String,
        occupation: String,
        mobile_no: String,
        email: String,
        income: Number
      },
      mother: {
        name: String,
        occupation: String,
        mobile_no: String,
        email: String,
        income: Number
      },
      guardian: {
        name: String,
        relationship: String,
        mobile_no: String,
        email: String,
        is_orphan: Boolean,
        is_semi_orphan: Boolean,
        is_deserted: Boolean
      }
    }
  },
  contact: {
    student_email: String,
    mobile_no: Number,
    alternate_mobile_no: Number,
    address: {
      communication: {
        address_line1: String,
        address_line2: String,
        city: String,
        state: String,
        pincode: String,
        country: String
      },
      permanent: {
        address_line1: String,
        address_line2: String,
        city: String,
        state: String,
        pincode: String,
        country: String
      }
    }
  },
  academic_info: [{
    qualification: String,
    institution: String,
    board: String,
    year_of_passing: Number,
    percentage: Number,
    marksheet: String,
    schooling_type: String,
    study_medium: String,
    umis: String,
    emis: String,
    achievement: [String],
    schooling_address: {
      address_type: String,
      city: String,
      state: String,
      pincode: String,
      country: String
    }
  }],
  current_academic: {
    section: String,
    part_one: String,
    part_five: String,
    umis: String,
    semesters: { type: Array, default: [] },
    extra_curricular: { type: Array, default: [] },
    department_code: String,
    department_name: String,
    program_code: String,
    program_name: String,
    program_type: String
  },
  disciplinary: { type: Array, default: [] },
  remarks: String,
  registration_date: Date,
  status: { type: String, default: "Active" }
}, { timestamps: true });

export default mongoose.model("EnrolledStudent", EnrolledStudentSchema);

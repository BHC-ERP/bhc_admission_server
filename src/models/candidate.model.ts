import mongoose from "mongoose";

const CandidateSchema = new mongoose.Schema({

    /* ==================== SYSTEM ==================== */
    registration_number: {
        type: Number,
        required: true,
        unique: true,
        index: true
    } ,
    academic_year: {
        type: String,
        default: "2026-2027",
        match: [/^\d{4}-\d{4}$/, "YYYY-YYYY format"]
    },

    admission_type: {
        type: String,
        enum: ['Regular', 'Merit', 'Late Admission', 'Recommendation'],
        default: 'Regular'
    },

    /* ==================== ADMISSION STATUS ==================== */
    admission_status: {
        current: {
            type: String,
            enum: [
                'Draft', 'Applied', 'Under Review', 'Provisional',
                'Document Verification', 'Fee Pending',
                'Admitted', 'Rejected', 'Cancelled',
                'On Hold', 'Waitlisted'
            ],
            default: 'Draft',
            index: true
        },
        previous: String,
        status_history: [{
            status: String,
            changed_at: Date,
            remarks: String,
            _id: false
        }]
    },

    /* ==================== PERSONAL DETAILS ==================== */
    personal_details: {
        basic_info: {
            name: {
                first_name: String,
                last_name: String,
                full_name: String
            },
            gender: { type: String },
            date_of_birth: Date,
            age: Number,
            nationality: String,
            religion: String,
            community: String,
            community_number: String,
            caste: String,
            sub_caste: String,
            blood_group: {
                type: String,
                enum: [
                    "O+", "O-", "A+", "A-", "A1+", "A1-", "A2+", "A2-",
                    "B+", "B-", "B1+", "B1-", "AB+", "AB-",
                    "A1B+", "A1B-", "A2B+", "A2B-"
                ]
            },
            aadhar_number: {
                type: String,
                match: [/^\d{12}$/, "Aadhar must be 12 digits"]
            }
        },
        parents :{
            father_name:String,
            father_mobile: Number,
            father_occupation:String,
            father_income:String,
            mother_name:String,
            mother_mobile: Number,
            mother_occupation:String,
            mother_income:String,
            guardian :{
                is_guardian:Boolean,
                guardian_name:String,
                guardian_mobile:Number,


            }
        },
        contact_info: {
            mobile: {
                type: String, required: true, index: true
            },
            email: {
                type: String,
                required: true,
                lowercase: true,
                match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email"],
                index: true
            }
        }
    },

    /* ==================== ACADEMIC BACKGROUND ==================== */
    academic_background: {
        school_education: {
            tenth: {
                board: String,
                school_name: String,
                school_address: String,
                school_type: {
                    type: String,
                    enum: ['Government', 'Government Aided', 'Private', 'CBSE', 'ICSE', 'Other']
                },
                medium: String,
                emis_number: String,
                year_of_passing: { type: Number, min: 1950, max: () => new Date().getFullYear() },
                attempts: { type: Number, min: 1, default: 1 },
                marks: {
                    total: Number,
                    max_total: Number,
                    percentage: Number
                }
            },

            twelfth: {
                board: String,
                school_name: String,
                school_address: String,
                school_type: {
                    type: String,
                    enum: ['Government', 'Government Aided', 'Private', 'CBSE', 'ICSE', 'Other']
                },
                medium: String,
                emis_number: String,
                year_of_passing: { type: Number, min: 1950, max: () => new Date().getFullYear() },
                register_number: String,
                attempts: { type: Number, min: 1, default: 1 },
                group: String,
                marks: {
                    total: Number,
                    max_total: Number,
                    percentage: Number
                },
                subjects: [{
                    name: String,
                    marks: Number,
                    max: Number,
                    _id: false
                }]
            }
        },

        undergraduate_education: {
            degree: String,
            college: String,
            university: String,
            register_number: String,
            duration: {
                start_year: Number,
                end_year: Number
            },
            year_of_passing: Number,
            grading_system: { type: String, enum: ['Percentage', 'CGPA', 'GPA'] },
            marks: {
                part1_percentage: Number,
                part2_percentage: Number,
                part3_major_percentage: Number,
                part3_allied_percentage: Number,
                overall_percentage: Number,
                cgpa: Number,
                class: {
                    type: String,
                    enum: [
                        'First Class with Distinction',
                        'First Class',
                        'Second Class',
                        'Third Class',
                        'Pass'
                    ]
                }
            },
            arrears: {
                had_arrears: Boolean,
                cleared: Boolean,
                count: { type: Number, min: 0, default: 0 }
            }
        },

        entrance_exams: [{
            exam_name: String,
            register_number: String,
            year: Number,
            score: Number,
            percentile: Number,
            rank: Number,
            _id: false
        }],

        other_qualifications: [{
            name: String,
            issuing_authority: String,
            year: Number,
            certificate_url: String,
            _id: false
        }]
    },

    /* ==================== ADDRESS ==================== */
    address: {
        present_address: {
            type: { type: String, enum: ['residential', 'commercial', 'other'] },
            door_no: String,
            street: String,
            area: String,
            landmark: String,
            village_town: String,
            taluk: String,
            district: String,
            state: String,
            country: { type: String, default: 'India' },
            pincode: { type: String, match: [/^\d{6}$/, "Invalid pincode"] }
        },
        permanent_address: {
            same_as_present: Boolean,
            door_no: String,
            street: String,
            area: String,
            landmark: String,
            village_town: String,
            taluk: String,
            district: String,
            state: String,
            country: { type: String, default: 'India' },
            pincode: String,
            domicile_state: String
        }
    },

    /* ==================== APPLICATION PREFERENCES ==================== */
    application_preferences: {
        applications: [{
            application_number: Number,
            application_type: { type: String, enum: ['UG', 'PG', 'Diploma', 'Certificate', 'PhD'] },
            stream: { type: String, enum: ['Aided', 'Self Financed'] },
            program_code: String,
            program_name: String,
            shift: { type: String, enum: ['Shift-I', 'Shift-II'] },
            preference_order: { type: Number, min: 1 },
            status: {
                type: String,
                enum: ['Applied', 'Under Review', 'Selected', 'Not Selected', 'Waitlisted', 'Cancelled']
            },
            admission_details: {
                admit_status: { type: String, enum: ['Yes', 'No', 'Pending'] },
                admission_date: Date
            },
            _id: false
        }]
    },
       /* ==================== BANK DETAILS ==================== */
     bank_details: {
    account_holder_name: String,
    account_number: Number,
    bank_name: String,
    branch: String,
    ifsc_code: String},

    /* ==================== DOCUMENTS ==================== */
    documents: {
        required_documents: [{
            document_type: String,
            uploaded_url: String,
            uploaded_date: Date,
            verified: Boolean,
            remarks: String,
            _id: false
        }]
    },

    /* ==================== INTERVIEW ==================== */
    interview_test: {
        required: Boolean,
        stages: [{
            stage_name: String,
            stage_type: { type: String, enum: ['test', 'interview', 'practical'] },
            schedule: {
                date: Date,
                venue: String,
                status: { type: String, enum: ['scheduled', 'completed'] }
            },
            result: {
                status: { type: String, enum: ['pending', 'selected', 'not selected'] }
            },
            _id: false
        }]
    },
    payment:{
        amount: Number,
        status: String
    },
    /* ==================== FACILITIES ==================== */
    facilities: {
        hostel: {
            required: Boolean,
            type: { type: String, enum: ['Boys Hostel', 'Girls Hostel'] },
            allocation_status: {
                type: String,
                enum: ['pending', 'allocated', 'confirmed', 'cancelled']
            }
        },
        transport: {
            required: Boolean
        }
    },

    /* ==================== METADATA ==================== */
    metadata: {
        version: { type: Number, default: 1 },
        is_active: { type: Boolean, default: true }
    }

},
    {
        timestamps: true,
        versionKey: false
    });

/* ==================== PRE SAVE ==================== */
CandidateSchema.pre("save", function (next) {
    if (this.personal_details?.basic_info?.date_of_birth) {
        const dob = new Date(this.personal_details.basic_info.date_of_birth);
        this.personal_details.basic_info.age =
            new Date(Date.now() - dob.getTime()).getUTCFullYear() - 1970;
    }
});

/* ==================== MODEL ==================== */
export default mongoose.model(
    "CandidateAdmission",
    CandidateSchema
);

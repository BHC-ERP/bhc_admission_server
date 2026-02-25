import mongoose from "mongoose";

const CandidateSchema = new mongoose.Schema({

    /* ==================== SYSTEM ==================== */
    registration_number: {
        type: Number,
        required: true,
        unique: true
    },
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
            default: 'Draft'
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
        fullName: { type: String, required: true },
        dateOfBirth: { type: Date, required: true },
        gender: { 
            type: String, 
            enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
            required: true 
        },
        genderOther: String,
        email: {
            type: String,
            required: true,
            lowercase: true,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email"]
        },
        phone: {
            type: String,
            required: true
        },
        nationality: { type: String, default: 'Indian' },
        aadharNumber: {
            type: String,
            match: [/^\d{12}$/, "Aadhar must be 12 digits"],
            sparse: true
        },
        caste: String, 
        passportNumber: String, 
        countryOfOrigin: String,
        community: {
            type: String,
            enum: ['BC', 'BCM', 'MBC', 'MBC & DNC', 'SC', 'SCA', 'ST', 'OC', 'BS', 'Other']
        },
        bloodGroup: {
            type: String,
            enum: [
                "O+", "O-", "A+", "A-", "A1+", "A1-", "A2+", "A2-",
                "B+", "B-", "B1+", "B1-", "AB+", "AB-",
                "A1B+", "A1B-", "A2B+", "A2B-"
            ]
        },
        religion: {
            type: String,
            enum: ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other']
        },
        religionOther: String,
        differentlyAbledType: String,
        differentlyAbledPercentage: {
            type: Number,
            min: 0,
            max: 100
        },
        christianDenomination: {
            type: String,
            enum: ['Catholic', 'CSI', 'Other', 'None']
        },
        christianDenominationOther: String,
        differentlyAbled: {
            type: Boolean,
            default: false
        },
        childOfExServicemen: {
            type: Boolean,
            default: false
        }
    },

    /* ==================== ADDRESS ==================== */
    address: {
        present_address: {
            type: { 
                type: String, 
                enum: ['residential', 'commercial', 'other'],
                default: 'residential'
            },
            door_no: String,
            street: String,
            area: String,
            landmark: String,
            village_town: String,
            taluk: String,
            district: String,
            state: String,
            country: { type: String, default: 'India' },
            pincode: { 
                type: String, 
                match: [/^\d{6}$/, "Invalid pincode"],
                sparse: true
            }
        },
        permanent_address: {
            same_as_present: { type: Boolean, default: false },
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

    /* ==================== ACADEMIC BACKGROUND ==================== */
    academic_background: {
        programmeType: {
            type: String,
            enum: ['UG', 'PG', 'Diploma', 'Certificate', 'PhD'],
            required: true
        },
        programmeName: String,
        school_education: {
            is_first_generation_learner: { type: Boolean, default: false },
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
                school_address_details: {
                    country: { type: String, default: 'India' },
                    state: String,
                    district: String,
                    pincode: String
                },
                year_of_passing: { 
                    type: Number, 
                    min: 1950, 
                    max: () => new Date().getFullYear() 
                },
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
                register_number: String,
                school_address_details: {
                    country: { type: String, default: 'India' },
                    state: String,
                    district: String,
                    pincode: String
                },
                year_of_passing: { 
                    type: Number, 
                    min: 1950, 
                    max: () => new Date().getFullYear() 
                },
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
        undergraduate_education: [{
            id: Number,
            degree: String,
            specialization: String,
            district: String,
            state: String,
            college: String,
            university: String,
            register_number: String,
            duration: {
                start_year: Number,
                end_year: Number
            },
            year_of_passing: Number,
            marks: {
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
                had_arrears: { type: Boolean, default: false },
                cleared: { type: Boolean, default: false },
                count: { type: Number, min: 0, default: 0 }
            },
            attempts: { type: Number, default: 1 },
            _id: false
        }],
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

    /* ==================== PARENTS/GUARDIAN DETAILS ==================== */
    parents: {
        father_title: {
            type: String,
            enum: ['Mr', 'Late']
        },
        father_name: String,
        father_mobile: String,
        father_occupation: String,
        father_income: String,
        mother_title: {
            type: String,
            enum: ['Mrs', 'Ms', 'Late']
        },
        mother_name: String,
        mother_mobile: String,
        mother_occupation: String,
        mother_income: String,
        guardian: {
            is_guardian: { type: Boolean, default: false },
            guardian_name: String,
            guardian_mobile: String,
            guardian_relation: String,
            is_orphan: { type: Boolean, default: false }
        }
    },

    /* ==================== BANK DETAILS ==================== */
    bank_details: {
        account_holder_name: String,
        account_number: String,
        bank_name: String,
        branch: String,
        ifsc_code: String
    },

    /* ==================== CATEGORY AND FACILITIES ==================== */
    category_and_facilities: { 
        facilities: {
            hostel: {
                required: { type: Boolean, default: false }
            },
            transport: {
                required: { type: Boolean, default: false }
            }
        }, 
    },

    /* ==================== DOCUMENTS ==================== */
    documents: { 
        // Keep the existing required_documents array for flexibility
        required_documents: [{
            document_type: String,
            uploaded_url: String,
            uploaded_date: Date,
            verified: { type: Boolean, default: false },
            remarks: String,
            _id: false
        }]
    },

    /* ==================== APPLICATION PREFERENCES ==================== */
    application_preferences: {
        applications: [{
            application_number: Number,
            application_type: { 
                type: String, 
                enum: ['UG', 'PG', 'Diploma', 'Certificate', 'PhD'] 
            },
            stream: { 
                type: String, 
                enum: ['Aided', 'Self Financed'] 
            },
            program_code: String,
            program_name: String,
            shift: { 
                type: String, 
                enum: ['Shift-I', 'Shift-II'] 
            },
            preference_order: { type: Number, min: 1 },
            status: {
                type: String,
                enum: ['Applied', 'Under Review', 'Selected', 'Not Selected', 'Waitlisted', 'Cancelled']
            },
            admission_details: {
                admit_status: { 
                    type: String, 
                    enum: ['Yes', 'No', 'Pending'] 
                },
                admission_date: Date
            },
            _id: false
        }]
    },

    /* ==================== INTERVIEW ==================== */
    interview_test: {
        required: { type: Boolean, default: false },
        stages: [{
            stage_name: String,
            stage_type: { 
                type: String, 
                enum: ['test', 'interview', 'practical'] 
            },
            schedule: {
                date: Date,
                venue: String,
                status: { 
                    type: String, 
                    enum: ['scheduled', 'completed'] 
                }
            },
            result: {
                status: { 
                    type: String, 
                    enum: ['pending', 'selected', 'not selected'] 
                }
            },
            _id: false
        }]
    }, 

    /* ==================== PAYMENT ==================== */
    payment: {
        amount: Number,
        status: {
            type: String,
            enum: ['pending', 'partial', 'completed', 'refunded'],
            default: 'pending'
        },
        transaction_id: String,
        payment_date: Date,
        payment_method: String
    },

    /* ==================== METADATA ==================== */
    metadata: {
        version: { type: Number, default: 1 },
        is_active: { type: Boolean, default: true },
        submitted_at: Date,
        last_modified_by: String,
        ip_address: String,
        user_agent: String
    }

},
{
    timestamps: true,
    versionKey: false
});

/* ==================== INDEXES ==================== */
CandidateSchema.index({ 'personal_details.email': 1 });
CandidateSchema.index({ 'personal_details.phone': 1 });
CandidateSchema.index({ 'personal_details.aadharNumber': 1 });
CandidateSchema.index({ registration_number: 1 });
CandidateSchema.index({ 'admission_status.current': 1 });
CandidateSchema.index({ createdAt: -1 });

 
/* ==================== VIRTUAL FIELDS ==================== */
CandidateSchema.virtual('full_name').get(function() {
    return this.personal_details?.fullName;
});

CandidateSchema.virtual('age').get(function() {
    if (!this.personal_details?.dateOfBirth) return null;
    
    const dob = new Date(this.personal_details.dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    
    return age;
});
 
/* ==================== STATICS ==================== */
CandidateSchema.statics.findByEmail = function(email) {
    return this.findOne({ 'personal_details.email': email });
};

CandidateSchema.statics.findByPhone = function(phone) {
    return this.findOne({ 'personal_details.phone': phone });
};

CandidateSchema.statics.findByRegistrationNumber = function(regNumber) {
    return this.findOne({ registration_number: regNumber });
};

CandidateSchema.statics.getPendingApplications = function() {
    return this.find({ 'admission_status.current': 'Applied' });
};

/* ==================== MODEL ==================== */
const CandidateAdmission = mongoose.model("CandidateAdmission", CandidateSchema);

export default CandidateAdmission;
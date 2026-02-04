import mongoose from "mongoose";

export type CandidateStatus = "active" | "inactive" | "blocked";

export interface CandidateDocument extends Document {
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  mobileNumber: string;
  status: CandidateStatus;
  createdAt: Date;
  updatedAt: Date;
}
export type AdmissionType =
  | 'Regular'
  | 'Merit'
  | 'Late Admission'
  | 'Recommendation';

export type AdmissionStatus =
  | 'Draft'
  | 'Applied'
  | 'Under Review'
  | 'Provisional'
  | 'Document Verification'
  | 'Fee Pending'
  | 'Admitted'
  | 'Rejected'
  | 'Cancelled'
  | 'On Hold'
  | 'Waitlisted';

export type BloodGroup =
  | "O+" | "O-" | "A+" | "A-" | "A1+" | "A1-" | "A2+" | "A2-"
  | "B+" | "B-" | "B1+" | "B1-" | "AB+" | "AB-"
  | "A1B+" | "A1B-" | "A2B+" | "A2B-";

export interface RequiredDocument {
  document_type: string;
  uploaded_url: string;
  uploaded_date: Date;
  verified: boolean;
  remarks?: string;
}

export interface CandidateDocuments {
  required_documents: RequiredDocument[];
}

export interface BasicInfo {
  name:  string;
  gender?: string;
  date_of_birth?: Date;
  age?: number;
  nationality?: string;
  religion?: string;
  community?: string;
  community_number?: string;
  caste?: string;
  sub_caste?: string;
  blood_group?: BloodGroup;
  aadhar_number?: string;
  differently_abled?: {
    is_differently_abled: Boolean;
    disability_type: String;
    disability_percentage: String;
  };
  ex_serviceman_child: {
    is_ex_serviceman_child: Boolean;
    grade: String;
  };
}

export interface ParentsInfo {
  father_name?: string;
  father_mobile?: number;
  father_occupation?: string;
  father_income?: string;
  mother_name?: string;
  mother_mobile?: number;
  mother_occupation?: string;
  mother_income?: string;
  guardian?: {
    is_guardian?: boolean;
    guardian_name?: string;
    guardian_mobile?: number;
  };
}

export interface ContactInfo {
  mobile: string;
  email: string;
}

export interface PersonalDetails {
  basic_info?: BasicInfo;
  parents?: ParentsInfo;
  contact_info: ContactInfo;
}

export interface SchoolMarks {
  total?: number;
  max_total?: number;
  percentage?: number;
}

export interface SubjectMark {
  name?: string;
  marks?: number;
  max?: number;
}

export interface SchoolEducation {
  tenth?: {
    board?: string;
    school_name?: string;
    school_address?: string;
    school_type?: string;
    medium?: string;
    emis_number?: string;
    year_of_passing?: number;
    attempts?: number;
    marks?: SchoolMarks;
  };
  twelfth?: {
    board?: string;
    school_name?: string;
    school_address?: string;
    school_type?: string;
    medium?: string;
    emis_number?: string;
    register_number?: string;
    year_of_passing?: number;
    attempts?: number;
    group?: string;
    marks?: SchoolMarks;
    subjects?: SubjectMark[];
  };
}

export interface UndergraduateEducation {
  degree?: string;
  college?: string;
  university?: string;
  register_number?: string;
  duration?: {
    start_year?: number;
    end_year?: number;
  };
  year_of_passing?: number;
  grading_system?: 'Percentage' | 'CGPA' | 'GPA';
  marks?: {
    part1_percentage?: number;
    part2_percentage?: number;
    part3_major_percentage?: number;
    part3_allied_percentage?: number;
    overall_percentage?: number;
    cgpa?: number;
    class?: string;
  };
  arrears?: {
    had_arrears?: boolean;
    cleared?: boolean;
    count?: number;
  };
}

export interface AcademicBackground {
  school_education?: SchoolEducation;
  undergraduate_education?: UndergraduateEducation;
  entrance_exams?: {
    exam_name?: string;
    register_number?: string;
    year?: number;
    score?: number;
    percentile?: number;
    rank?: number;
  }[];
  other_qualifications?: {
    name?: string;
    issuing_authority?: string;
    year?: number;
    certificate_url?: string;
  }[];
}

export interface Address {
  present_address?: {
    type?: 'residential' | 'commercial' | 'other';
    door_no?: string;
    street?: string;
    area?: string;
    landmark?: string;
    village_town?: string;
    taluk?: string;
    district?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  permanent_address?: {
    same_as_present?: boolean;
    door_no?: string;
    street?: string;
    area?: string;
    landmark?: string;
    village_town?: string;
    taluk?: string;
    district?: string;
    state?: string;
    country?: string;
    pincode?: string;
    domicile_state?: string;
  };
}

export interface ApplicationPreference {
  application_number?: number;
  application_type?: 'UG' | 'PG' | 'Diploma' | 'Certificate' | 'PhD';
  stream?: 'Aided' | 'Self Financed';
  program_code?: string;
  program_name?: string;
  shift?: 'Shift-I' | 'Shift-II';
  preference_order?: number;
  status?: string;
  admission_details?: {
    admit_status?: 'Yes' | 'No' | 'Pending';
    admission_date?: Date;
  };
}

export interface ApplicationPreferences {
  applications?: ApplicationPreference[];
}

export interface BankDetails {
  account_holder_name?: string;
  account_number?: number;
  bank_name?: string;
  branch?: string;
  ifsc_code?: string;
}

export interface InterviewTest {
  required?: boolean;
  stages?: {
    stage_name?: string;
    stage_type?: 'test' | 'interview' | 'practical';
    schedule?: {
      date?: Date;
      venue?: string;
      status?: 'scheduled' | 'completed';
    };
    result?: {
      status?: 'pending' | 'selected' | 'not selected';
    };
  }[];
}

export interface Facilities {
  hostel?: {
    required?: boolean;
    type?: 'Boys Hostel' | 'Girls Hostel';
    allocation_status?: string;
  };
  transport?: {
    required?: boolean;
  };
}

export interface Candidate extends mongoose.Document {
  registration_number: number;
  academic_year: string;
  admission_type: AdmissionType;

  admission_status?: {
    current?: AdmissionStatus;
    previous?: string;
    status_history?: {
      status?: string;
      changed_at?: Date;
      remarks?: string;
    }[];
  };

  personal_details?: PersonalDetails;
  academic_background?: AcademicBackground;
  address?: Address;
  application_preferences?: ApplicationPreferences;
  bank_details?: BankDetails;
  documents?: CandidateDocuments;
  interview_test?: InterviewTest;

  payment?: {
    amount?: number;
    status?: string;
  };

  facilities?: Facilities;

  metadata?: {
    version?: number;
    is_active?: boolean;
  };

  createdAt?: Date;
  updatedAt?: Date;
}

import { Document, Types } from "mongoose";

export interface IQualification {
  _id?: Types.ObjectId;
  degree: string;
  specialization?: string;
  institution: string;
  year_of_passing: string;
  percentage_cgpa?: string;
  certificate?: string;
}

export interface IExperience {
  _id?: Types.ObjectId;
  type: "teaching" | "industry";
  organization: string;
  role: string;
  from: Date;
  to?: Date;
  years?: number;
}

export interface ISubjectTaught {
  _id: Types.ObjectId;
  department_name: string;
  program_id: string;
  year: string;
  section_name: string;
  dayOrder: number;
  hour: number;
  incharge:boolean;
}

export interface IResearchExpertise {
  broad_area: string[];
  specialization: string[];
}

export interface IPhDDetails {
  thesis_title: string;
  guide_name: string;
  co_guide_name?: string;
  university: string;
  registration_year?: number;
  awarded_year?: number;
  status: "awarded" | "submitted" | "pursuing";
}

export interface IResearchGuidance {
  _id?: Types.ObjectId;
  scholar_name: string;
  register_no?: string;
  degree: "PhD" | "M.Phil";
  university_name: string;
  status: "ongoing" | "completed";
  joining_year: number;
  awarded_year?: number;
}

export interface IJournalArticle {
  _id?: Types.ObjectId;
  title: string;
  journal_name: string;
  issn?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  year: string;
  level: "International" | "National" | "Regional" | "Institutional";
  indexing: "Scopus" | "Web of Science" | "UGC Care" | "Others";
  impact_factor?: number;
  citation_count?: number;
  author_position?: string;
  link?: string;
  authors: string[]; // Main authors array
  co_authors?: string[]; // Co-authors array (max 5)
}

export interface IConferencePaper {
  _id?: Types.ObjectId;
  title: string;
  conference_name: string;
  isbn?: string;
  location?: string;
  year: string;
  level: "International" | "National" | "Regional" | "Institutional";
  publisher?: string;
  indexing?: string;
  authors: string[];
  co_authors?: string[];
}

export interface IBookChapter {
  _id?: Types.ObjectId;
  title: string;
  book_title: string;
  publisher: string;
  isbn?: string;
  year: string;
  chapter_no?: string;
  level: "International" | "National" | "Regional" | "Institutional";
  authors: string[];
  co_authors?: string[];
}

export interface IBookAuthored {
  _id?: Types.ObjectId;
  title: string;
  publisher: string;
  isbn: string;
  year: string;
  level: "International" | "National" | "Regional" | "Institutional";
  authors: string[];
  co_authors?: string[];
}

export interface IEditedVolume {
  _id?: Types.ObjectId;
  title: string;
  publisher: string;
  isbn: string;
  year: string;
  level: "International" | "National" | "Regional" | "Institutional";
  authors: string[];
  co_authors?: string[];
}

export interface IPatent {
  _id?: Types.ObjectId;
  title: string;
  country?: string;
  patent_no: string;
  application_no?: string;
  date: string;
  inventors: string[]; // Already using array
}

export interface IIPR {
  _id?: Types.ObjectId;
  type: "Patent" | "Copyright" | "Trademark";
  title: string;
  app_no?: string;
  country?: string;
  filed_year: number;
  granted_year?: number;
  status: "filed" | "published" | "granted";
}

export interface IFundedProject {
  _id?: Types.ObjectId;
  title: string;
  funding_agency: string;
  scheme?: string;
  amount: number;
  sanction_year: number;
  status: "ongoing" | "completed";
  role: "PI" | "Co-PI";
}

export interface IConsultancy {
  _id?: Types.ObjectId;
  industry_partner: string;
  description: string;
  revenue_generated: number;
  year: number;
}

export interface ICollaboration {
  _id?: Types.ObjectId;
  organization: string;
  country?: string;
  type: "MoU" | "Joint Project" | "Student Support";
  start_year: number;
  end_year?: number;
}

export interface IMembership {
  _id?: Types.ObjectId;
  body_name: string;
  membership_id?: string;
  role?: string;
  valid_till?: Date;
}

export interface IEditorialRole {
  _id?: Types.ObjectId;
  journal_name: string;
  role: "Reviewer" | "Editorial Board Member";
  indexing?: string;
  since_year: number;
}

export interface IAward {
  _id?: Types.ObjectId;
  title: string;
  organization: string;
  year: number;
}

export interface IEvent {
  _id?: Types.ObjectId;
  type: "workshop" | "seminar" | "FDP" | "webinar";
  title: string;
  duration?: string;
  mode?: "online" | "offline";
  organized_by: string;
  year: number;
}

export interface IInnovation {
  _id?: Types.ObjectId;
  type: "Startup" | "Prototype" | "Technology Transfer" | "Innovation";
  title: string;
  description?: string;
  year: number;
  funding_support?: string;
}

export interface IResearchProfiles {
  orcid?: string;
  scopus_id?: string;
  researcher_id?: string;
  google_scholar?: string;
  publons?: string;
  linkedin?: string;
}

export interface IDisciplinaryAction {
  _id?: Types.ObjectId;
  action_type: string;
  description: string;
  date: Date;
  remarks?: string;
}

export interface IStaff extends Document {
  category: string;
  staff_id: string;
  bio_id?: number;
  alt_staffid: string;
  salute: string;
  name: string;
  gender: "Male" | "Female" | "Other";
  dob: string;
  marital_status?: string;
  college_email: string;
  email?: string;
  phone: string;
  alternate_phone?: string;
  blood_group?: string;
  nationality?: string;
  religion?: string;
  mother_tongue?: string;
  community?: string;

  address: {
    present: { street?: string; city?: string; state?: string; pincode?: string };
    permanent: { street?: string; city?: string; state?: string; pincode?: string };
  };

  designation: string;

  department: Types.ObjectId;
  department_code: string;
  department_name: string;
  shift: "Shift-1" | "Shift-2";
  stream: "Aided" | "Self-Finance";
  aadhar_number?: number;
  pan_number?: string;

  joining_date: String;
  employee_type: "teaching" | "non-teaching" | 'gardener' | 'security';
  isActive: boolean;

  qualifications: IQualification[];
  experience: IExperience[];
  class_attend: ISubjectTaught[];
  research_expertise: IResearchExpertise;
  isDoctorate: boolean;
  phd_details?: IPhDDetails;
  research_guidance: IResearchGuidance[];

  publications: {
    journal_articles: IJournalArticle[];
    conference_papers: IConferencePaper[];
    book_chapters: IBookChapter[];
    books_authored: IBookAuthored[];
    edited_volume: IEditedVolume[];
    patent: IPatent[];
  };

  intellectual_property: IIPR[];
  funded_projects: IFundedProject[];
  consultancy: IConsultancy[];
  collaborations: ICollaboration[];
  memberships: IMembership[];
  editorial_roles: IEditorialRole[];
  awards: IAward[];
  events_participated: IEvent[];
  innovation_activities: IInnovation[];
  research_profiles: IResearchProfiles;
  disciplinary_actions: IDisciplinaryAction[];

  username?: string;
  password?: string;
  role?: RoleType[];
  profile_pic?: string;
  otpVerify: string;
}
export const RoleEnum = [
  "admin",
  "faculty",
  "mentor",
  "principal",
  "hod",
  "staff",
  "teaching staff",
  "non teaching staff",
] as const;

export type RoleType = (typeof RoleEnum)[number];

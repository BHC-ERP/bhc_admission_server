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
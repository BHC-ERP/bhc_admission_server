import { Request, Response } from "express";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import collegedataModel from "../../models/collegedata.model";
import countryModel from "../../models/country.model";
import cityModel from "../../models/city.model";
import casteModel from "../../models/caste.model";
import { getSessionUserId } from "../../config/session";
import CandidateAdmission from "../../models/candidate.model";

// Initialize S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

// Document types constant
const documentTypes = [
    'passport_photo', 'tenth_marksheet', 'twelfth_marksheet',
    'ug_degree_certificate', 'ug_marksheets', 'community_certificate',
    'income_certificate', 'presbyter_letter', 'aadhar_card',
    'passport_copy', 'tancet_scorecard'
] as const;

// ==================== HELPER FUNCTIONS ====================

const generateS3Key = (
    registrationNumber: number,
    documentType: string,
    fileName: string
): string => {
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.]/g, '_');
    return `admission/2026-2027/Student/${registrationNumber}/${documentType}/${registrationNumber}_${sanitizedFileName}`;
};

const uploadFileToS3 = async (
    file: Express.Multer.File,
    registrationNumber: number,
    documentType: string
): Promise<string> => {
    const key = generateS3Key(registrationNumber, documentType, file.originalname);

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
            originalName: file.originalname,
            uploadedBy: registrationNumber.toString(),
            documentType
        }
    });

    await s3Client.send(command);
    return key;
};

const generatePresignedUrl = async (key: string): Promise<string> => {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
    });
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};

// ==================== MASTER DATA CONTROLLERS ====================

// GET /college_location
export const collegeLocationController = async (req: Request, res: Response) => {
    try {
        const college_location = await collegedataModel
            .find({})
            .select("university college college_type state district")
            .lean();

        return res.json({
            count: college_location.length,
            college_location
        });
    } catch (error) {
        console.error("Error fetching college locations:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// GET /country
export const countryController = async (req: Request, res: Response) => {
    try {
        const country = await countryModel.find({}).lean();
        return res.json({
            count: country.length,
            country
        });
    } catch (error) {
        console.error("Error fetching countries:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// GET /state
export const stateController = async (req: Request, res: Response) => {
    try {
        const city = await cityModel.find({}).distinct("state_name").lean();
        return res.json({
            count: city.length,
            city
        });
    } catch (error) {
        console.error("Error fetching states:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// GET /city/:state_name
export const cityController = async (req: Request, res: Response) => {
    try {
        const { state_name } = req.params;
        const city = await cityModel
            .find({ state_name })
            .select("pincode sub_city city")
            .lean();

        return res.json({
            count: city.length,
            city
        });
    } catch (error) {
        console.error("Error fetching cities:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// GET /pincode/:pincode
export const pincodeController = async (req: Request, res: Response) => {
    try {
        const pincode = Number(req.params.pincode);

        if (isNaN(pincode)) {
            return res.status(400).json({ message: "Invalid pincode" });
        }

        const city = await cityModel
            .find({ pincode })
            .select("pincode sub_city city state_name")
            .lean();

        return res.json({
            count: city.length,
            city
        });
    } catch (error) {
        console.error("Error fetching pincode data:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// GET /caste_list
export const casteListController = async (req: Request, res: Response) => {
    try {
        const caste = await casteModel
            .find({})
            .select("castes")
            .lean();

        return res.json({
            count: caste.length,
            caste
        });
    } catch (error) {
        console.error("Error fetching caste list:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


export const getDashboardDataController = async (req: Request, res: Response) => {
    try {
        const registration_number = req.params.registration_number ? parseInt(req.params.registration_number.toString()) : null;
        if (!registration_number || isNaN(registration_number)) {
            return res.status(400).json({ message: "Registration number is required and must be a valid number" });
        }

        const candidate = await CandidateAdmission.findOne({ registration_number })
            .select("registration_number personal_details admission_type admission_status academic_year interview_test payment documents application_preferences academic_background")
            .lean();

        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        // Calculate personal details completion percentage
        const personalDetails = candidate.personal_details || {};
        const requiredPersonalFields = ['fullName', 'dateOfBirth', 'gender', 'email', 'phone', 'nationality', 'community'];
        const filledPersonalFields = requiredPersonalFields.filter((field) =>
            (personalDetails as Record<string, any>)[field] && (personalDetails as Record<string, any>)[field] !== ''
        ).length;
        const personalDetailsPercentage = Math.round((filledPersonalFields / requiredPersonalFields.length) * 100);

        // Get academic marks based on admission type
        let academicMarks = {
            twelfthMark: 0,
            ugMark: 0,
            isTwelfthRequired: false,
            isUGRequired: false
        };

        // Check application preferences to determine program types
        const applications = candidate.application_preferences?.applications || [];

        // Determine if any applications are UG or PG
        const hasUGApplication = applications.some(app => app.application_type === 'UG');
        const hasPGApplication = applications.some(app => app.application_type === 'PG');

        // Get academic marks from academic_background
        if (candidate.academic_background) {
            const academicBg = candidate.academic_background;

            // For UG programs, check 12th marks
            if (hasUGApplication && academicBg.school_education?.twelfth) {
                const twelfth = academicBg.school_education.twelfth;
                // Calculate 12th marks if available (you might need to adjust this based on your data structure)
                if (twelfth.subjects && twelfth.subjects.length > 0) {
                    const totalMarks = twelfth.subjects.reduce((sum, subject) => sum + (subject.marks || 0), 0);
                    academicMarks.twelfthMark = Math.round(totalMarks / twelfth.subjects.length);
                }
                academicMarks.isTwelfthRequired = true;
            }

            // For PG programs, check UG marks
            if (hasPGApplication && academicBg.undergraduate_education && academicBg.undergraduate_education.length > 0) {
                const ugEducation = academicBg.undergraduate_education[0];
                // Calculate UG marks (CGPA/Percentage conversion might be needed)
                if (ugEducation.marks?.cgpa) {
                    // Convert CGPA to percentage if needed (example: CGPA * 9.5)
                    academicMarks.ugMark = Math.round(ugEducation.marks?.cgpa * 9.5);
                } else if (ugEducation.marks?.overall_percentage) {
                    academicMarks.ugMark = Math.round(ugEducation.marks?.overall_percentage!);
                }
                academicMarks.isUGRequired = true;
            }
        }

        // Calculate document upload count and check mandatory documents
        const requiredDocuments = candidate.documents?.required_documents || [];
        const uploadedDocuments = requiredDocuments.filter(doc => doc.verified === true);
        const documentsUploaded = uploadedDocuments.length;

        // Determine if document upload is mandatory based on application type
        const isDocumentUploadMandatory = hasUGApplication || hasPGApplication; // You can customize this logic

        // Calculate overall application completion
        const totalRequirements = 3; // Personal details, Academic marks, Documents
        let completedRequirements = 0;

        if (personalDetailsPercentage >= 80) completedRequirements++; // Consider personal details complete if 80% filled
        if ((hasUGApplication && academicMarks.twelfthMark > 0) || (hasPGApplication && academicMarks.ugMark > 0)) completedRequirements++;
        if (!isDocumentUploadMandatory || documentsUploaded > 0) completedRequirements++;

        const overallCompletionPercentage = Math.round((completedRequirements / totalRequirements) * 100);

        return res.json({
            registration_number: candidate.registration_number,
            personal_details: candidate.personal_details,
            personal_details_completion: personalDetailsPercentage,
            payment_status: candidate.payment?.status || 'pending',
            payment_details: candidate.payment || {},
            documents: {
                required_documents: candidate.documents?.required_documents || [],
                uploaded_count: documentsUploaded,
                total_required: requiredDocuments.length,
                is_mandatory: isDocumentUploadMandatory,
                completion_percentage: requiredDocuments.length > 0
                    ? Math.round((documentsUploaded / requiredDocuments.length) * 100)
                    : 0
            },
            academic_marks: academicMarks,
            admission_status: candidate.admission_status,
            academic_year: candidate.academic_year,
            admission_type: candidate.admission_type,
            interview_details: candidate.interview_test || {},
            overall_completion: {
                percentage: overallCompletionPercentage,
                requirements_met: completedRequirements,
                total_requirements: totalRequirements,
                is_complete: overallCompletionPercentage >= 80
            },
            // Application summary for quick view
            application_summary: {
                total_applications: applications.length,
                ug_applications: applications.filter(app => app.application_type === 'UG').length,
                pg_applications: applications.filter(app => app.application_type === 'PG').length,
                preferred_programs: applications
                    .sort((a, b) => (a.preference_order || 999) - (b.preference_order || 999))
                    .slice(0, 3)
                    .map(app => ({
                        application_number: app.application_number,
                        application_type: app.application_type,
                        program_name: app.program_name,
                        program_code: app.program_code,
                        preference_order: app.preference_order,
                        stream: app.stream,
                        status: app.status
                    }))
            }
        });

    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        return res.status(500).json({
            message: "Internal server error",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

// =====================Get Application Form Controllers====================

export const getPersonalDataController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);
        const candidate = await CandidateAdmission.findById(userId).select("personal_details").lean();
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }
        return res.status(200).json({
            personal_details: candidate.personal_details
        });
    } catch (error) {
        console.error("Error fetching personal details:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const getParentsDetailsController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);
        const candidate = await CandidateAdmission.findById(userId).select("parents").lean();
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }
        return res.status(200).json({
            parents: candidate.parents
        });
    } catch (error) {
        console.error("Error fetching parents details:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const getAddressController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);
        const candidate = await CandidateAdmission.findById(userId).select("address").lean();
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }
        return res.status(200).json({
            address: candidate.address
        });
    } catch (error) {
        console.error("Error fetching address details:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const getAcademicBackgroundController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);
        const candidate = await CandidateAdmission.findById(userId).select("academic_background").lean();
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }
        return res.status(200).json({
            academic_background: candidate.academic_background
        });
    } catch (error) {
        console.error("Error fetching academic background details:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const getBankDetailsController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);
        const candidate = await CandidateAdmission.findById(userId).select("bank_details").lean();
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }
        return res.status(200).json({
            bank_details: candidate.bank_details
        });
    } catch (error) {
        console.error("Error fetching bank details:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const getCategoryFacilitiesController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);
        const candidate = await CandidateAdmission.findById(userId).select("category_and_facilities").lean();
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }
        return res.status(200).json({
            category_and_facilities: candidate.category_and_facilities
        });
    } catch (error) {

        console.error("Error fetching category and facilities details:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ==================== APPLICATION FORM CONTROLLERS ====================

// POST /personal_details
export const personalDetailsController = async (req: Request, res: Response) => {
    try {
        const personalDetails = req.body;
        const userId = await getSessionUserId(req.cookies.sid);

        // Validate required fields
        const requiredFields = ['fullName', 'dateOfBirth', 'gender', 'email', 'phone'];
        for (const field of requiredFields) {
            if (!personalDetails[field]) {
                return res.status(400).json({ message: `${field} is required`, field });
            }
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(personalDetails.email)) {
            return res.status(400).json({ message: "Invalid email format", field: "email" });
        }

        // Validate phone (Indian mobile number)
        const mobileRegex = /^[6-9]\d{9}$/;
        if (!mobileRegex.test(personalDetails.phone)) {
            return res.status(400).json({ message: "Invalid mobile number format", field: "phone" });
        }

        // Update candidate with personal details
        const updatedCandidate = await CandidateAdmission.findByIdAndUpdate(
            userId,
            {
                $set: {
                    personal_details: personalDetails,
                    "metadata.last_modified_by": userId,
                    "metadata.ip_address": req.ip || req.socket.remoteAddress,
                    "metadata.user_agent": req.get("user-agent") || "Unknown"
                }
            },
            { new: true, runValidators: true }
        ).select("personal_details");

        if (!updatedCandidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        return res.status(200).json({
            message: "Personal details saved successfully",
            step: 1,
            completed: true,
            data: updatedCandidate.personal_details
        });

    } catch (error) {
        console.error("Error saving personal details:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// POST /address
export const addressController = async (req: Request, res: Response) => {
    try {
        const addressData = req.body;
        const userId = await getSessionUserId(req.cookies.sid);

        // Validate address structure
        if (!addressData.present_address || !addressData.permanent_address) {
            return res.status(400).json({
                message: "Both present and permanent address are required"
            });
        }

        // Validate pincode if provided
        const pincodeRegex = /^\d{6}$/;
        if (addressData.present_address.pincode && !pincodeRegex.test(addressData.present_address.pincode)) {
            return res.status(400).json({
                message: "Invalid present address pincode format",
                field: "present_address.pincode"
            });
        }

        if (addressData.permanent_address.pincode && !addressData.permanent_address.same_as_present) {
            if (!pincodeRegex.test(addressData.permanent_address.pincode)) {
                return res.status(400).json({
                    message: "Invalid permanent address pincode format",
                    field: "permanent_address.pincode"
                });
            }
        }

        // Update candidate with address details
        const updatedCandidate = await CandidateAdmission.findByIdAndUpdate(
            userId,
            { $set: { address: addressData, "metadata.last_modified_by": userId } },
            { new: true, runValidators: true }
        ).select("address");

        if (!updatedCandidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        return res.status(200).json({
            message: "Address details saved successfully",
            step: 2,
            completed: true,
            data: updatedCandidate.address
        });

    } catch (error) {
        console.error("Error saving address:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// POST /academic_background
export const academicBackgroundController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);
        const academicData = req.body;
        const currentYear = new Date().getFullYear();


        // Validate tenth year
        if (academicData.school_education?.tenth?.year_of_passing) {
            const tenthYear = academicData.school_education.tenth.year_of_passing;
            if (tenthYear > currentYear) {
                return res.status(400).json({
                    message: `10th year of passing cannot be in the future. Current year is ${currentYear}`,
                    field: "school_education.tenth.year_of_passing"
                });
            }
            if (tenthYear < 1950) {
                return res.status(400).json({
                    message: "10th year of passing cannot be before 1950",
                    field: "school_education.tenth.year_of_passing"
                });
            }
        }

        // Validate twelfth year
        if (academicData.school_education?.twelfth?.year_of_passing) {
            const twelfthYear = academicData.school_education.twelfth.year_of_passing;
            if (twelfthYear > currentYear) {
                return res.status(400).json({
                    message: `12th year of passing cannot be in the future. Current year is ${currentYear}`,
                    field: "school_education.twelfth.year_of_passing"
                });
            }
            if (twelfthYear < 1950) {
                return res.status(400).json({
                    message: "12th year of passing cannot be before 1950",
                    field: "school_education.twelfth.year_of_passing"
                });
            }
        }

        // Validate marks
        if (academicData.school_education?.tenth?.marks) {
            const { total, max_total } = academicData.school_education.tenth.marks;
            if (total > max_total) {
                return res.status(400).json({
                    message: "Total marks cannot exceed maximum marks",
                    field: "tenth.marks"
                });
            }
        }

        if (academicData.school_education?.twelfth?.marks) {
            const { total, max_total } = academicData.school_education.twelfth.marks;
            if (total > max_total) {
                return res.status(400).json({
                    message: "Total marks cannot exceed maximum marks",
                    field: "twelfth.marks"
                });
            }
        }

        // Update candidate
        const updatedCandidate = await CandidateAdmission.findByIdAndUpdate(
            userId,
            {
                $set: {
                    academic_background: academicData,
                    "metadata.last_modified_by": userId
                }
            },
            { new: true, runValidators: false }
        ).select("academic_background");

        if (!updatedCandidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        return res.status(200).json({
            message: "Academic background saved successfully",
            step: 3,
            completed: true,
            data: updatedCandidate.academic_background
        });

    } catch (error: any) {
        console.error("Error saving academic background:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// POST /parents_details
export const parentsDetailsController = async (req: Request, res: Response) => {
    try {
        const parentsData = req.body;
        const userId = await getSessionUserId(req.cookies.sid);

        // Validate guardian information
        if (parentsData.guardian?.is_guardian) {
            if (!parentsData.guardian.guardian_name || !parentsData.guardian.guardian_mobile) {
                return res.status(400).json({
                    message: "Guardian name and mobile are required when guardian is specified",
                    field: "guardian"
                });
            }
        }

        // Validate mobile numbers
        const mobileRegex = /^[6-9]\d{9}$/;
        if (parentsData.father_mobile && !mobileRegex.test(parentsData.father_mobile)) {
            return res.status(400).json({
                message: "Invalid father's mobile number",
                field: "father_mobile"
            });
        }
        if (parentsData.mother_mobile && !mobileRegex.test(parentsData.mother_mobile)) {
            return res.status(400).json({
                message: "Invalid mother's mobile number",
                field: "mother_mobile"
            });
        }

        // Update candidate
        const updatedCandidate = await CandidateAdmission.findByIdAndUpdate(
            userId,
            {
                $set: {
                    parents: parentsData,
                    "metadata.last_modified_by": userId
                }
            },
            { new: true, runValidators: true }
        ).select("parents");

        if (!updatedCandidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        return res.status(200).json({
            message: "Parents/Guardian details saved successfully",
            step: 4,
            completed: true,
            data: updatedCandidate.parents
        });

    } catch (error) {
        console.error("Error saving parents details:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// POST /bank_details
export const bankDetailsController = async (req: Request, res: Response) => {
    try {
        const bankData = req.body;
        const userId = await getSessionUserId(req.cookies.sid);

        // Validate IFSC code
        if (bankData.ifsc_code) {
            const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
            if (!ifscRegex.test(bankData.ifsc_code)) {
                return res.status(400).json({
                    message: "Invalid IFSC code format",
                    field: "ifsc_code"
                });
            }
        }

        // Validate account number
        if (bankData.account_number && bankData.account_number.length < 9) {
            return res.status(400).json({
                message: "Account number must be at least 9 digits",
                field: "account_number"
            });
        }

        // Update candidate
        const updatedCandidate = await CandidateAdmission.findByIdAndUpdate(
            userId,
            {
                $set: {
                    bank_details: bankData,
                    "metadata.last_modified_by": userId
                }
            },
            { new: true, runValidators: true }
        ).select("bank_details");

        if (!updatedCandidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        return res.status(200).json({
            message: "Bank details saved successfully",
            step: 5,
            completed: true,
            data: updatedCandidate.bank_details
        });

    } catch (error) {
        console.error("Error saving bank details:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// POST /category_facilities
export const categoryFacilitiesController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);
        const categoryData = req.body;

        if (!categoryData.category_and_facilities) {
            return res.status(400).json({
                message: "Category and facilities data is required"
            });
        }

        const updatedCandidate = await CandidateAdmission.findByIdAndUpdate(
            userId,
            {
                $set: {
                    category_and_facilities: categoryData.category_and_facilities,
                    "metadata.last_modified_by": userId
                }
            },
            { new: true, runValidators: true }
        ).select("category_and_facilities");

        if (!updatedCandidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        return res.status(200).json({
            message: "Category and facilities saved successfully",
            step: 6,
            completed: true,
            data: updatedCandidate.category_and_facilities
        });

    } catch (error) {
        console.error("Error saving category and facilities:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ==================== DOCUMENT UPLOAD CONTROLLERS ====================

// POST /upload_document/:registration_number/:documentType
export const uploadDocumentByRegNoController = async (req: Request, res: Response) => {
    try {
        const registrationNumber = parseInt(req.params.registration_number.toString());
        const { documentType } = req.params;
        const file = req.file;

        if (isNaN(registrationNumber)) {
            return res.status(400).json({ message: "Invalid registration number" });
        }

        if (!documentTypes.includes(documentType as any)) {
            return res.status(400).json({
                message: "Invalid document type",
                validTypes: documentTypes
            });
        }

        if (!file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const candidate = await CandidateAdmission.findOne({ registration_number: registrationNumber });
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        const s3Key = await uploadFileToS3(file, candidate.registration_number, documentType as any);

        await CandidateAdmission.findOneAndUpdate(
            { registration_number: registrationNumber },
            {
                $push: {
                    "documents.required_documents": {
                        document_type: documentType,
                        uploaded_url: s3Key,
                        uploaded_date: new Date(),
                        verified: false,
                        remarks: ""
                    }
                }
            }
        );

        const viewUrl = await generatePresignedUrl(s3Key);

        return res.status(200).json({
            message: "Document uploaded successfully",
            registration_number: registrationNumber,
            document: {
                document_type: documentType,
                uploaded_date: new Date(),
                view_url: viewUrl,
                key: s3Key,
                file_name: file.originalname,
                file_size: file.size,
                file_type: file.mimetype
            }
        });

    } catch (error) {
        console.error("Error uploading document:", error);
        return res.status(500).json({ message: "Error uploading document" });
    }
};

// POST /upload_documents/:registration_number
export const uploadMultipleDocumentsController = async (req: Request, res: Response) => {
    try {
        const registrationNumber = parseInt(req.params.registration_number.toString());
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        if (isNaN(registrationNumber)) {
            return res.status(400).json({ message: "Invalid registration number" });
        }

        const candidate = await CandidateAdmission.findOne({ registration_number: registrationNumber });
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        const uploadedDocuments = [];
        const documentsArray = [];

        for (const [documentType, fileArray] of Object.entries(files)) {
            if (fileArray && fileArray.length > 0) {
                const file = fileArray[0];
                const s3Key = await uploadFileToS3(file, candidate.registration_number, documentType);
                const viewUrl = await generatePresignedUrl(s3Key);

                uploadedDocuments.push({
                    document_type: documentType,
                    view_url: viewUrl,
                    key: s3Key,
                    file_name: file.originalname,
                    file_size: file.size,
                    file_type: file.mimetype
                });

                documentsArray.push({
                    document_type: documentType,
                    uploaded_url: s3Key,
                    uploaded_date: new Date(),
                    verified: false,
                    remarks: ""
                });
            }
        }

        if (documentsArray.length > 0) {
            await CandidateAdmission.findOneAndUpdate(
                { registration_number: registrationNumber },
                { $push: { "documents.required_documents": { $each: documentsArray } } }
            );
        }

        return res.status(200).json({
            message: "Documents uploaded successfully",
            registration_number: registrationNumber,
            count: uploadedDocuments.length,
            documents: uploadedDocuments
        });

    } catch (error) {
        console.error("Error uploading documents:", error);
        return res.status(500).json({ message: "Error uploading documents" });
    }
};

// POST /upload_document/:documentType
export const uploadDocumentController = async (req: Request, res: Response) => {
    try {
        const registrationNumber = req.body.registration_number ? parseInt(req.body.registration_number) : null;

        if (!registrationNumber || isNaN(registrationNumber)) {
            return res.status(400).json({ message: "Registration number is required" });
        }

        const { documentType } = req.params;
        const file = req.file;

        if (!documentTypes.includes(documentType as any)) {
            return res.status(400).json({
                message: "Invalid document type",
                validTypes: documentTypes
            });
        }

        if (!file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const candidate = await CandidateAdmission.findOne({ registration_number: registrationNumber });
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        const s3Key = await uploadFileToS3(file, candidate.registration_number, documentType as any);

        await CandidateAdmission.findOneAndUpdate(
            { registration_number: registrationNumber },
            {
                $push: {
                    "documents.required_documents": {
                        document_type: documentType,
                        uploaded_url: s3Key,
                        uploaded_date: new Date(),
                        verified: false,
                        remarks: ""
                    }
                }
            }
        );

        const viewUrl = await generatePresignedUrl(s3Key);

        return res.status(200).json({
            message: "Document uploaded successfully",
            registration_number: registrationNumber,
            document: {
                document_type: documentType,
                uploaded_date: new Date(),
                view_url: viewUrl,
                key: s3Key,
                file_name: file.originalname,
                file_size: file.size,
                file_type: file.mimetype
            }
        });

    } catch (error) {
        console.error("Error uploading document:", error);
        return res.status(500).json({ message: "Error uploading document" });
    }
};

// ==================== DOCUMENT MANAGEMENT CONTROLLERS ====================

// GET /documents/:registration_number
export const getDocumentsByRegNoController = async (req: Request, res: Response) => {
    try {
        const registrationNumber = parseInt(req.params.registration_number.toString());

        if (isNaN(registrationNumber)) {
            return res.status(400).json({ message: "Invalid registration number" });
        }

        const candidate = await CandidateAdmission.findOne({ registration_number: registrationNumber });
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        const documentsWithUrls = [];
        if (candidate.documents?.required_documents) {
            for (const doc of candidate.documents.required_documents) {
                const viewUrl = await generatePresignedUrl(doc.uploaded_url!);
                documentsWithUrls.push({
                    document_type: doc.document_type,
                    view_url: viewUrl,
                    uploaded_date: doc.uploaded_date,
                    verified: doc.verified,
                    remarks: doc.remarks
                });
            }
        }

        return res.json({
            registration_number: registrationNumber,
            count: documentsWithUrls.length,
            documents: documentsWithUrls
        });

    } catch (error) {
        console.error("Error fetching documents:", error);
        return res.status(500).json({ message: "Error fetching documents" });
    }
};

// GET /documents
export const getDocumentsController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);

        const candidate = await CandidateAdmission.findById(userId);
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        const documentsWithUrls = [];
        if (candidate.documents?.required_documents) {
            for (const doc of candidate.documents.required_documents) {
                const viewUrl = await generatePresignedUrl(doc.uploaded_url!);
                documentsWithUrls.push({
                    document_type: doc.document_type,
                    view_url: viewUrl,
                    uploaded_date: doc.uploaded_date,
                    verified: doc.verified,
                    remarks: doc.remarks
                });
            }
        }

        return res.json({
            count: documentsWithUrls.length,
            documents: documentsWithUrls
        });

    } catch (error) {
        console.error("Error fetching documents:", error);
        return res.status(500).json({ message: "Error fetching documents" });
    }
};

// DELETE /documents/:registration_number/:documentType
export const deleteDocumentController = async (req: Request, res: Response) => {
    try {
        const registrationNumber = parseInt(req.params.registration_number.toString());
        const { documentType } = req.params;

        if (isNaN(registrationNumber)) {
            return res.status(400).json({ message: "Invalid registration number" });
        }

        const candidate = await CandidateAdmission.findOne({ registration_number: registrationNumber });
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        const documentToDelete = candidate.documents?.required_documents?.find(
            doc => doc.document_type === documentType
        );

        if (!documentToDelete) {
            return res.status(404).json({
                message: "Document not found for this candidate",
                registration_number: registrationNumber,
                document_type: documentType
            });
        }

        const s3Key = documentToDelete.uploaded_url;

        const result = await CandidateAdmission.findOneAndUpdate(
            { registration_number: registrationNumber },
            { $pull: { "documents.required_documents": { document_type: documentType } } },
            { new: true }
        );

        if (!result) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        try {
            if (s3Key) {
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: s3Key
                });
                await s3Client.send(deleteCommand);
                console.log(`File deleted from S3: ${s3Key}`);
            }
        } catch (s3Error) {
            console.error("Error deleting file from S3:", s3Error);
        }

        return res.json({
            message: "Document deleted successfully",
            registration_number: registrationNumber,
            document_type: documentType
        });

    } catch (error) {
        console.error("Error deleting document:", error);
        return res.status(500).json({ message: "Error deleting document" });
    }
};

// ==================== APPLICATION STATUS CONTROLLERS ====================

// POST /documents_submit
export const submitApplicationController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);

        const candidate = await CandidateAdmission.findById(userId);
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        // Check required documents
        const requiredDocuments = ['passport_photo', 'tenth_marksheet', 'twelfth_marksheet', 'aadhar_card'];
        const uploadedDocTypes = candidate.documents?.required_documents?.map(doc => doc.document_type) || [];
        const missingDocuments = requiredDocuments.filter(docType => !uploadedDocTypes.includes(docType));

        if (missingDocuments.length > 0) {
            return res.status(400).json({
                message: "Please upload all required documents",
                missingDocuments
            });
        }

        // Update candidate status
        const updatedCandidate = await CandidateAdmission.findByIdAndUpdate(
            userId,
            {
                $set: {
                    "admission_status.current": "Applied",
                    "metadata.submitted_at": new Date(),
                    "metadata.last_modified_by": userId,
                    "metadata.version": (candidate.metadata?.version || 0) + 1
                }
            },
            { new: true, runValidators: true }
        ).select("-__v");

        if (!updatedCandidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        // Add to status history
        await CandidateAdmission.findByIdAndUpdate(
            userId,
            {
                $push: {
                    "admission_status.status_history": {
                        status: "Applied",
                        changed_at: new Date(),
                        remarks: "Application submitted successfully"
                    }
                }
            }
        );

        // Generate document URLs
        const documentUrls = [];
        if (candidate.documents?.required_documents) {
            for (const doc of candidate.documents.required_documents) {
                const viewUrl = await generatePresignedUrl(doc.uploaded_url!);
                documentUrls.push({
                    document_type: doc.document_type,
                    view_url: viewUrl,
                    uploaded_date: doc.uploaded_date,
                    verified: doc.verified
                });
            }
        }

        return res.status(200).json({
            message: "Application submitted successfully",
            step: 7,
            completed: true,
            registration_number: updatedCandidate.registration_number,
            application_status: updatedCandidate.admission_status?.current,
            submitted_at: updatedCandidate.metadata?.submitted_at,
            documents: documentUrls
        });

    } catch (error) {
        console.error("Error submitting application:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// GET /progress
export const getProgressController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);

        const candidate = await CandidateAdmission.findById(userId)
            .select("personal_details address academic_background parents bank_details category_and_facilities documents admission_status");

        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        const steps = [
            { name: "Personal Details", completed: !!candidate.personal_details && Object.keys(candidate.personal_details).length > 0 },
            { name: "Address", completed: !!candidate.address && Object.keys(candidate.address).length > 0 },
            { name: "Academic Background", completed: !!candidate.academic_background && Object.keys(candidate.academic_background).length > 0 },
            { name: "Parents/Guardian Details", completed: !!candidate.parents && Object.keys(candidate.parents).length > 0 },
            { name: "Bank Details", completed: !!candidate.bank_details && Object.keys(candidate.bank_details).length > 0 },
            { name: "Category & Facilities", completed: !!candidate.category_and_facilities && Object.keys(candidate.category_and_facilities).length > 0 },
            { name: "Documents", completed: !!(candidate.documents?.required_documents?.length && candidate.documents.required_documents.length > 0) },
            { name: "Submit", completed: candidate.admission_status?.current === "Applied" }
        ];

        const completedSteps = steps.filter(step => step.completed).length;
        const totalSteps = steps.length;
        const progressPercentage = (completedSteps / totalSteps) * 100;

        return res.json({
            registration_number: candidate.registration_number,
            current_status: candidate.admission_status?.current || "Draft",
            progress: {
                percentage: Math.round(progressPercentage * 100) / 100,
                completed_steps: completedSteps,
                total_steps: totalSteps,
                steps
            }
        });

    } catch (error) {
        console.error("Error fetching progress:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// GET /data
export const getFormDataController = async (req: Request, res: Response) => {
    try {
        const userId = await getSessionUserId(req.cookies.sid);

        const candidate = await CandidateAdmission.findById(userId)
            .select("personal_details address academic_background parents bank_details category_and_facilities documents registration_number admission_status");

        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found" });
        }

        return res.json({
            registration_number: candidate.registration_number,
            current_status: candidate.admission_status?.current || "Draft",
            formData: {
                personal_details: candidate.personal_details || {},
                address: candidate.address || {},
                academic_background: candidate.academic_background || {},
                parents: candidate.parents || {},
                bank_details: candidate.bank_details || {},
                category_and_facilities: candidate.category_and_facilities || {},
                documents: candidate.documents || {}
            }
        });

    } catch (error) {
        console.error("Error fetching form data:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
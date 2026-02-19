import { Router, Request, Response, NextFunction } from "express";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import multer from "multer";
import crypto from "crypto";
import collegedataModel from "../models/collegedata.model";
import candidateModel from "../models/candidate.model";
import casteModel from "../models/caste.model";
import countryModel from "../models/country.model";
import cityModel from "../models/city.model";

const router = Router();

// Configure S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ""
  }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || "your-bucket-name";

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, PDF, and DOC files are allowed.'));
    }
  }
});

// Extend Request type to include session user
export interface AuthenticatedRequest extends Request {
  session: {
    user?: {
      id: string;
      registration_number?: number;
      role?: string;
    }
  } & Express.Request['session'];
  file?: Express.Multer.File;
  files?: { [fieldname: string]: Express.Multer.File[] };
}
 

// Document type mapping
const documentTypes = [
  'passport_photo',
  'tenth_marksheet',
  'twelfth_marksheet',
  'ug_degree_certificate',
  'ug_marksheets',
  'community_certificate',
  'income_certificate',
  'presbyter_letter',
  'aadhar_card',
  'passport_copy',
  'tancet_scorecard'
] as const;

type DocumentType = typeof documentTypes[number];

// Helper function to generate S3 key
const generateS3Key = (
  registrationNumber: number,
  documentType: string,
  fileName: string
): string => {
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.]/g, '_');
  const uniqueId = crypto.randomBytes(8).toString('hex');
  return `admission/2026-2027/Student/${registrationNumber}/${documentType}/${uniqueId}_${sanitizedFileName}`;
};

// Helper function to upload file to S3
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
  
  // Return the key (not the full URL) - we'll generate presigned URLs when viewing
  return key;
};

// Helper function to generate presigned URL for viewing
const generatePresignedUrl = async (key: string): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });
  
  // URL expires in 1 hour
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};

/* ==================== EXISTING ROUTES ==================== */

router.get("/college_location", async (req: Request, res: Response) => {
  const college_location = await collegedataModel
    .find({})
    .select("university college college_type state district")
    .lean();

  return res.json({
    count: college_location.length,
    college_location
  });
});

router.get("/country", async (req: Request, res: Response) => {
  const country = await countryModel
    .find({})
    .lean();

  return res.json({
    count: country.length,
    country
  });
});

router.get("/state", async (req: Request, res: Response) => {
  const city = await cityModel
    .find({})
    .distinct("state_name")
    .lean();

  return res.json({
    count: city.length,
    city
  });
});

router.get("/city/:state_name", async (req: Request, res: Response) => {
  const { state_name } = req.params
  const city = await cityModel
    .find({ state_name })
    .select("pincode sub_city city")
    .lean();

  return res.json({
    count: city.length,
    city
  });
});

router.get("/pincode/:pincode", async (req: Request, res: Response) => {
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
});

router.get("/caste_list", async (req: Request, res: Response) => {
  const caste = await casteModel
    .find({})
    .select("castes")
    .lean();

  return res.json({
    count: caste.length,
    caste
  });
});

/* ==================== NEW STEP-BY-STEP FORM ROUTES ==================== */

/**
 * Route 1: Save Personal Details
 * Endpoint: POST /application_form/personal_details
 */
router.post("/personal_details/", async (req: Request, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const personalDetails = req.body;

    // Validate required fields
    const requiredFields = ['fullName', 'dateOfBirth', 'gender', 'email', 'phone'];
    for (const field of requiredFields) {
      if (!personalDetails[field]) {
        return res.status(400).json({ 
          message: `${field} is required`,
          field 
        });
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(personalDetails.email)) {
      return res.status(400).json({ 
        message: "Invalid email format",
        field: "email" 
      });
    }

    // Validate phone (Indian mobile number)
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(personalDetails.phone)) {
      return res.status(400).json({ 
        message: "Invalid mobile number format",
        field: "phone" 
      });
    }

    // Update candidate with personal details
    const updatedCandidate = await candidateModel.findByIdAndUpdate(
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
});

/**
 * Route 2: Save Address Details
 * Endpoint: POST /application_form/address
 */
router.post("/address", async (req: Request, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const addressData = req.body;

    // Validate address structure
    if (!addressData.present_address || !addressData.permanent_address) {
      return res.status(400).json({ 
        message: "Both present and permanent address are required" 
      });
    }

    // Validate pincode if provided
    if (addressData.present_address.pincode) {
      const pincodeRegex = /^\d{6}$/;
      if (!pincodeRegex.test(addressData.present_address.pincode)) {
        return res.status(400).json({ 
          message: "Invalid present address pincode format",
          field: "present_address.pincode" 
        });
      }
    }

    if (addressData.permanent_address.pincode && 
        !addressData.permanent_address.same_as_present) {
      const pincodeRegex = /^\d{6}$/;
      if (!pincodeRegex.test(addressData.permanent_address.pincode)) {
        return res.status(400).json({ 
          message: "Invalid permanent address pincode format",
          field: "permanent_address.pincode" 
        });
      }
    }

    // Update candidate with address details
    const updatedCandidate = await candidateModel.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          address: addressData,
          "metadata.last_modified_by": userId 
        } 
      },
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
});

/**
 * Route 3: Save Academic Background
 * Endpoint: POST /application_form/academic_background
 */
router.post("/academic_background", async (req: Request, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const academicData = req.body;

    // Validate required academic fields
    if (!academicData.programmeType) {
      return res.status(400).json({ 
        message: "Programme type is required",
        field: "programmeType" 
      });
    }

    // Get current year for validation
    const currentYear = new Date().getFullYear();

    // Validate tenth year of passing if provided
    if (academicData.school_education?.tenth?.year_of_passing) {
      const tenthYear = academicData.school_education.tenth.year_of_passing;
      if (tenthYear > currentYear) {
        return res.status(400).json({
          message: `10th year of passing cannot be in the future. Current year is ${currentYear}`,
          field: "school_education.tenth.year_of_passing",
          value: tenthYear,
          maxAllowed: currentYear
        });
      }
      if (tenthYear < 1950) {
        return res.status(400).json({
          message: "10th year of passing cannot be before 1950",
          field: "school_education.tenth.year_of_passing",
          value: tenthYear,
          minAllowed: 1950
        });
      }
    }

    // Validate twelfth year of passing if provided
    if (academicData.school_education?.twelfth?.year_of_passing) {
      const twelfthYear = academicData.school_education.twelfth.year_of_passing;
      if (twelfthYear > currentYear) {
        return res.status(400).json({
          message: `12th year of passing cannot be in the future. Current year is ${currentYear}`,
          field: "school_education.twelfth.year_of_passing",
          value: twelfthYear,
          maxAllowed: currentYear
        });
      }
      if (twelfthYear < 1950) {
        return res.status(400).json({
          message: "12th year of passing cannot be before 1950",
          field: "school_education.twelfth.year_of_passing",
          value: twelfthYear,
          minAllowed: 1950
        });
      }
    }

    // Validate undergraduate years if provided
    if (academicData.undergraduate_education && Array.isArray(academicData.undergraduate_education)) {
      for (let i = 0; i < academicData.undergraduate_education.length; i++) {
        const ug = academicData.undergraduate_education[i];
        
        if (ug.year_of_passing && ug.year_of_passing > currentYear) {
          return res.status(400).json({
            message: `Undergraduate year of passing cannot be in the future. Current year is ${currentYear}`,
            field: `undergraduate_education[${i}].year_of_passing`,
            value: ug.year_of_passing,
            maxAllowed: currentYear
          });
        }
        
        if (ug.duration?.start_year && ug.duration?.end_year) {
          if (ug.duration.start_year > ug.duration.end_year) {
            return res.status(400).json({
              message: "Start year cannot be greater than end year",
              field: `undergraduate_education[${i}].duration`,
              startYear: ug.duration.start_year,
              endYear: ug.duration.end_year
            });
          }
        }
      }
    }

    // Validate entrance exam years if provided
    if (academicData.entrance_exams && Array.isArray(academicData.entrance_exams)) {
      for (let i = 0; i < academicData.entrance_exams.length; i++) {
        const exam = academicData.entrance_exams[i];
        if (exam.year && exam.year > currentYear) {
          return res.status(400).json({
            message: `Entrance exam year cannot be in the future. Current year is ${currentYear}`,
            field: `entrance_exams[${i}].year`,
            value: exam.year,
            maxAllowed: currentYear
          });
        }
      }
    }

    // Validate tenth marks if provided
    if (academicData.school_education?.tenth?.marks) {
      const { total, max_total } = academicData.school_education.tenth.marks;
      if (total > max_total) {
        return res.status(400).json({ 
          message: "Total marks cannot exceed maximum marks",
          field: "tenth.marks" 
        });
      }
    }

    // Validate twelfth marks if provided
    if (academicData.school_education?.twelfth?.marks) {
      const { total, max_total } = academicData.school_education.twelfth.marks;
      if (total > max_total) {
        return res.status(400).json({ 
          message: "Total marks cannot exceed maximum marks",
          field: "twelfth.marks" 
        });
      }
    }

    // Update candidate with academic background (use findOneAndUpdate with runValidators: false to bypass schema validation)
    const updatedCandidate = await candidateModel.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          academic_background: academicData,
          "metadata.last_modified_by": userId 
        } 
      },
      { new: true, runValidators: false } // Set to false to bypass schema validation
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
    
    // Handle specific validation errors
    if (error.name === "ValidationError") {
      const errors: Record<string, string> = {};
      
      for (const field in error.errors) {
        errors[field] = error.errors[field].message;
      }
      
      return res.status(400).json({
        message: "Validation failed",
        errors
      });
    }
    
    return res.status(500).json({ message: "Internal server error" });
  }
});
/**
 * Route 4: Save Parents/Guardian Details
 * Endpoint: POST /application_form/parents_details
 */
router.post("/parents_details", async (req: Request, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const parentsData = req.body;

    // Validate guardian information if is_guardian is true
    if (parentsData.guardian?.is_guardian) {
      if (!parentsData.guardian.guardian_name || !parentsData.guardian.guardian_mobile) {
        return res.status(400).json({ 
          message: "Guardian name and mobile are required when guardian is specified",
          field: "guardian" 
        });
      }
    }

    // Validate mobile numbers if provided
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

    // Update candidate with parents details
    const updatedCandidate = await candidateModel.findByIdAndUpdate(
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
});

/**
 * Route 5: Save Bank Details
 * Endpoint: POST /application_form/bank_details
 */
router.post("/bank_details", async (req: Request, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const bankData = req.body;

    // Validate IFSC code if provided
    if (bankData.ifsc_code) {
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscRegex.test(bankData.ifsc_code)) {
        return res.status(400).json({ 
          message: "Invalid IFSC code format",
          field: "ifsc_code" 
        });
      }
    }

    // Validate account number if provided (basic check)
    if (bankData.account_number && bankData.account_number.length < 9) {
      return res.status(400).json({ 
        message: "Account number must be at least 9 digits",
        field: "account_number" 
      });
    }

    // Update candidate with bank details
    const updatedCandidate = await candidateModel.findByIdAndUpdate(
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
});

/**
 * Route 6: Save Category and Facilities
 * Endpoint: POST /application_form/category_facilities
 */
router.post("/category_facilities", async (req: Request, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const categoryData = req.body;

    // Validate category data
    if (!categoryData.category_and_facilities) {
      return res.status(400).json({ 
        message: "Category and facilities data is required" 
      });
    }

    // Update candidate with category and facilities
    const updatedCandidate = await candidateModel.findByIdAndUpdate(
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
});
/**
 * Route: Upload single document by registration number
 * Endpoint: POST /application_form/upload_document/:registration_number/:documentType
 */
router.post(
  "/upload_document/:registration_number/:documentType",
  upload.single("document"),
  async (req: Request, res: Response): Promise<Response> => {
    try { 
      const registrationNumber = parseInt(req.params.registration_number.toString());
      const { documentType } = req.params;
      const file = req.file;

      // Validate registration number
      if (isNaN(registrationNumber)) {
        return res.status(400).json({ message: "Invalid registration number" });
      }

      // Validate document type
      if (!documentTypes.includes(documentType as DocumentType)) {
        return res.status(400).json({
          message: "Invalid document type",
          validTypes: documentTypes
        });
      }

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Find candidate by registration number
      const candidate = await candidateModel.findOne({ 
        registration_number: registrationNumber 
      });

      if (!candidate) {
        return res.status(404).json({ message: "Candidate not found with this registration number" });
      }

      // Upload file to S3
      const s3Key = await uploadFileToS3(
        file,
        candidate.registration_number,
        documentType.toString()
      );

      // Update candidate's documents array
      await candidateModel.findOneAndUpdate(
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
        },
        { new: true }
      );

      // Generate presigned URL for immediate viewing
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
  }
);

/**
 * Route: Upload multiple documents by registration number
 * Endpoint: POST /application_form/upload_documents/:registration_number
 */
router.post(
  "/upload_documents/:registration_number",
  upload.fields([
    { name: 'passport_photo', maxCount: 1 },
    { name: 'tenth_marksheet', maxCount: 1 },
    { name: 'twelfth_marksheet', maxCount: 1 },
    { name: 'ug_degree_certificate', maxCount: 1 },
    { name: 'ug_marksheets', maxCount: 1 },
    { name: 'community_certificate', maxCount: 1 },
    { name: 'income_certificate', maxCount: 1 },
    { name: 'presbyter_letter', maxCount: 1 },
    { name: 'aadhar_card', maxCount: 1 },
    { name: 'passport_copy', maxCount: 1 },
    { name: 'tancet_scorecard', maxCount: 1 }
  ]),
  async (req: Request, res: Response): Promise<Response> => {
    try { 
      const registrationNumber = parseInt(req.params.registration_number.toString());
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      // Validate registration number
      if (isNaN(registrationNumber)) {
        return res.status(400).json({ message: "Invalid registration number" });
      }

      // Find candidate by registration number
      const candidate = await candidateModel.findOne({ 
        registration_number: registrationNumber 
      });

      if (!candidate) {
        return res.status(404).json({ message: "Candidate not found with this registration number" });
      }

      const uploadedDocuments = [];
      const documentsArray = [];

      // Process each uploaded file
      for (const [documentType, fileArray] of Object.entries(files)) {
        if (fileArray && fileArray.length > 0) {
          const file = fileArray[0];
          
          // Upload to S3
          const s3Key = await uploadFileToS3(
            file,
            candidate.registration_number,
            documentType
          );

          // Generate presigned URL
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

      // Update candidate with all uploaded documents
      if (documentsArray.length > 0) {
        await candidateModel.findOneAndUpdate(
          { registration_number: registrationNumber },
          {
            $push: {
              "documents.required_documents": { $each: documentsArray }
            }
          }
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
  }
);

/**
 * Route: Upload single document by candidate ID (from session)
 * Endpoint: POST /application_form/upload_document/:documentType
 */
router.post(
  "/upload_document/:documentType",
  upload.single("document"),
  async (req: Request, res: Response): Promise<Response> => {
    try { 
      // This would require authentication middleware to get user ID from session
      // For now, using registration number from body as fallback
      const registrationNumber = req.body.registration_number ? 
        parseInt(req.body.registration_number) : null;
      
      if (!registrationNumber || isNaN(registrationNumber)) {
        return res.status(400).json({ message: "Registration number is required" });
      }

      const { documentType } = req.params;
      const file = req.file;

      // Validate document type
      if (!documentTypes.includes(documentType as DocumentType)) {
        return res.status(400).json({
          message: "Invalid document type",
          validTypes: documentTypes
        });
      }

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Find candidate by registration number
      const candidate = await candidateModel.findOne({ 
        registration_number: registrationNumber 
      });

      if (!candidate) {
        return res.status(404).json({ message: "Candidate not found with this registration number" });
      }

      // Upload file to S3
      const s3Key = await uploadFileToS3(
        file,
        candidate.registration_number,
        documentType.toString()
      );

      // Update candidate's documents array
      await candidateModel.findOneAndUpdate(
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
        },
        { new: true }
      );

      // Generate presigned URL for immediate viewing
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
  }
);

/**
 * Route: Get all documents for a candidate by registration number
 * Endpoint: GET /application_form/documents/:registration_number
 */
router.get("/documents/:registration_number", async (req: Request, res: Response): Promise<Response> => {
  try {
    const registrationNumber = parseInt(req.params.registration_number.toString());

    if (isNaN(registrationNumber)) {
      return res.status(400).json({ message: "Invalid registration number" });
    }

    const candidate = await candidateModel.findOne({ 
      registration_number: registrationNumber 
    });

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
});

/**
 * Route: Delete a document by registration number and document type
 * Endpoint: DELETE /application_form/documents/:registration_number/:documentType
 */
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

router.delete("/documents/:registration_number/:documentType", async (req: Request, res: Response): Promise<Response> => {
  try {
    const registrationNumber = parseInt(req.params.registration_number.toString());
    const { documentType } = req.params;

    if (isNaN(registrationNumber)) {
      return res.status(400).json({ message: "Invalid registration number" });
    }

    // First, find the candidate to get the document S3 key
    const candidate = await candidateModel.findOne({ 
      registration_number: registrationNumber 
    });

    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Find the document to get its S3 key
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

    // Store the S3 key before deletion
    const s3Key = documentToDelete.uploaded_url;

    // Remove from database
    const result = await candidateModel.findOneAndUpdate(
      { registration_number: registrationNumber },
      {
        $pull: {
          "documents.required_documents": {
            document_type: documentType
          }
        }
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Delete from S3 bucket
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      });
      
      await s3Client.send(deleteCommand);
      
      console.log(`File deleted from S3: ${s3Key}`);
    } catch (s3Error) {
      console.error("Error deleting file from S3:", s3Error);
      // Continue with response even if S3 deletion fails
      // You might want to handle this differently based on requirements
    }

    return res.json({
      message: "Document deleted successfully from database and S3",
      registration_number: registrationNumber,
      document_type: documentType,
      s3_key: s3Key
    });

  } catch (error) {
    console.error("Error deleting document:", error);
    return res.status(500).json({ message: "Error deleting document" });
  }
});
/**
 * Route: Submit application with documents
 * Endpoint: POST /application_form/documents_submit
 */
router.post("/documents_submit", async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.session.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const userId = req.session.user.id;
    const documentsData = req.body;

    // Get the candidate
    const candidate = await candidateModel.findById(userId);

    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Check if required documents are uploaded
    const requiredDocuments = [
      'passport_photo',
      'tenth_marksheet',
      'twelfth_marksheet',
      'aadhar_card'
    ];

    const uploadedDocTypes = candidate.documents?.required_documents?.map(
      doc => doc.document_type
    ) || [];

    const missingDocuments = requiredDocuments.filter(
      docType => !uploadedDocTypes.includes(docType)
    );

    if (missingDocuments.length > 0) {
      return res.status(400).json({
        message: "Please upload all required documents",
        missingDocuments
      });
    }

    // Update candidate status to Applied
    const updatedCandidate = await candidateModel.findByIdAndUpdate(
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
    await candidateModel.findByIdAndUpdate(
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

    // Generate view URLs for all documents
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
});

/**
 * Route: Get all uploaded documents with view URLs
 * Endpoint: GET /application_form/documents
 */
router.get("/documents", async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.session.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const userId = req.session.user.id;

    const candidate = await candidateModel.findById(userId);
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
});

/**
 * Helper Route: Get Application Progress
 * Endpoint: GET /application_form/progress
 */
router.get("/progress", async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.session.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const userId = req.session.user.id;

    const candidate = await candidateModel.findById(userId)
      .select("personal_details address academic_background parents bank_details category_and_facilities documents admission_status");

    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Calculate progress based on what's filled
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
});

/**
 * Route: Get Saved Form Data
 * Endpoint: GET /application_form/data
 */
router.get("/data", async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.session.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const userId = req.session.user.id;

    const candidate = await candidateModel.findById(userId)
      .select("personal_details address academic_background parents bank_details category_and_facilities documents registration_number admission_status application_preferences");

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
});

export default router;
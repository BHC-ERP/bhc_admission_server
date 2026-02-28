import { Router } from "express";
import multer from "multer";
import {
  collegeLocationController,
  countryController,
  stateController,
  cityController,
  pincodeController,
  casteListController,
  personalDetailsController,
  addressController,
  academicBackgroundController,
  parentsDetailsController,
  bankDetailsController,
  categoryFacilitiesController,
  uploadDocumentByRegNoController,
  uploadMultipleDocumentsController,
  uploadDocumentController,
  getDocumentsByRegNoController,
  getDocumentsController,
  deleteDocumentController,
  submitApplicationController,
  getProgressController,
  getFormDataController,
  getDashboardDataController,
  getPersonalDataController,
  getParentsDetailsController,
  getAddressController,
  getAcademicBackgroundController,
  getBankDetailsController,
  getCategoryFacilitiesController,
  getDocumentController
} from "../controllers/applicaitonForm/application.controller";

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/jpg', 'image/png',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, PDF, and DOC files are allowed.'));
    }
  }
});

// ==================== MASTER DATA ROUTES ====================
router.get("/college_location", collegeLocationController);
router.get("/country", countryController);
router.get("/state", stateController);
router.get("/city/:state_name", cityController);
router.get("/pincode/:pincode", pincodeController);
router.get("/caste_list", casteListController);


router.get("/dashboard-data/:registration_number", getDashboardDataController);

// ====================GET APPLICATION FORM ROUTES ====================
router.get("/personal_details", getPersonalDataController);
router.get("/parents_details", getParentsDetailsController);
router.get("/address", getAddressController);
router.get("/academic_background", getAcademicBackgroundController);
router.get("/higher_education", getBankDetailsController);
router.get("/category_facilities", getCategoryFacilitiesController);
router.get("/documents", getDocumentController);
// ==================== APPLICATION FORM ROUTES ====================
router.post("/personal_details", personalDetailsController);
router.post("/address", addressController);
router.post("/academic_background", academicBackgroundController);
router.post("/parents_details", parentsDetailsController);
router.post("/bank_details", bankDetailsController);
router.post("/category_facilities", categoryFacilitiesController);

// ==================== DOCUMENT UPLOAD ROUTES ====================
router.post(
  "/upload_document/:registration_number/:documentType",
  upload.single("document"),
  uploadDocumentByRegNoController
);

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
  uploadMultipleDocumentsController
);

router.post(
  "/upload_document/:documentType",
  upload.single("document"),
  uploadDocumentController
);

// ==================== DOCUMENT MANAGEMENT ROUTES ====================
router.get("/documents/:registration_number", getDocumentsByRegNoController);
router.get("/documents", getDocumentsController);
router.delete("/documents/:registration_number/:documentType", deleteDocumentController);

// ==================== APPLICATION STATUS ROUTES ====================
router.post("/documents_submit", submitApplicationController);
router.get("/progress", getProgressController);
router.get("/data", getFormDataController);

export default router;
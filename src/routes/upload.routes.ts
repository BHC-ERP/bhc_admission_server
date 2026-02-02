import express from 'express';  
import { uploadController } from '../controllers/upload.controller'; 
import upload from '../middlewares/multer';
const router = express.Router();

// POST: Upload document for a candidate
router.post(
    '/:registration_number/:document_type', upload.array("files", 1),   // 🔥 must be "files"
    uploadController.uploadDocument
);

// GET: Get all documents for a candidate
router.get(
    '/:registration_number',
    uploadController.getDocuments
);

// GET: Get specific document
router.get(
    '/:registration_number/:document_type/:filename',
    uploadController.getDocument
);

// DELETE: Delete specific document
router.delete(
    '/:registration_number/:document_type/:filename',
    uploadController.deleteDocument
);

// PUT: Update document verification status
router.put(
    '/:registration_number/:document_type/:filename/verify',
    uploadController.verifyDocument
);

export default router;
import express from 'express';  
import { uploadController } from '../controllers/upload.controller'; 
import upload from '../middlewares/multer';
import path from 'node:path';
import fs from "fs";
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
 
router.get(
  "/:registration_number/view/:document_type/:filename",
  async (req, res) => {
    try {
      const { registration_number, document_type, filename } = req.params;

      const filePath = path.join(
        process.cwd(),
        "uploads",
        "documents",
        registration_number,
        document_type,
        filename
      );

      // 🔒 Security check
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found" });
      }

      // Send file (browser decides how to render)
      return res.sendFile(filePath);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Unable to view file" });
    }
  }
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
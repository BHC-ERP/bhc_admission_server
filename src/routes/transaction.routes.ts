import { Router } from 'express';
import multer from 'multer';
import { uploadTransactions } from '../controllers/transaction.controller';

const router = Router();

// Use memory storage for parsing Excel data directly from buffer
const upload = multer({ storage: multer.memoryStorage() });

// Upload transactions excel
router.post('/upload', upload.single('file'), uploadTransactions);

export default router;

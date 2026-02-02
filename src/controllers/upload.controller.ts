import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import CandidateModel, {
} from "../models/candidate.model";
import { Candidate, RequiredDocument } from "../types/candidate.types";

/* ==================== MULTER REQUEST TYPE ==================== */
interface MulterRequest extends Request { }


/* ==================== HELPERS ==================== */
const toStringParam = (param: string | string[]): string =>
    Array.isArray(param) ? param[0] : param;

/* ==================== CONTROLLER ==================== */
export const uploadController = {

    /* ==================== UPLOAD DOCUMENT ==================== */
    uploadDocument: async (req: Request, res: Response) => {
        try {
            /* ==================== FILE VALIDATION ==================== */
            if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "No files uploaded"
                });
            }

            /* ==================== PARAMS ==================== */
            const registration_number = toStringParam(req.params.registration_number);
            const document_type = toStringParam(req.params.document_type);

            const regNumber = Number(registration_number);

            /* ==================== FIND CANDIDATE ==================== */
            const candidate = await CandidateModel.findOne({
                registration_number: regNumber
            }) as Candidate | null;

            if (!candidate) {
                // cleanup uploaded files
                for (const file of req.files) {
                    if (file.path && fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                }

                return res.status(404).json({
                    success: false,
                    message: "Candidate not found"
                });
            }

            /* ==================== INIT DOCUMENTS ==================== */
            if (!candidate.documents) {
                candidate.documents = { required_documents: [] };
            }

            /* ==================== PROCESS FILES ==================== */
            const uploadedDocs: RequiredDocument[] = [];

            for (const file of req.files as Express.Multer.File[]) {
                uploadedDocs.push({
                    document_type,
                    uploaded_url: `/uploads/documents/${registration_number}/${document_type}/${file.filename}`,
                    uploaded_date: new Date(),
                    verified: false,
                    remarks: ""
                });
            }

            /* ==================== SAVE TO DB ==================== */
            candidate.documents.required_documents.push(...uploadedDocs);
            await candidate.save();

            /* ==================== RESPONSE ==================== */
            return res.status(200).json({
                success: true,
                message: "Files uploaded successfully",
                data: {
                    registration_number,
                    document_type,
                    files: uploadedDocs
                }
            });

        } catch (error: any) {
            console.error("UploadDocument Error:", error);

            // cleanup on error
            if (req.files && Array.isArray(req.files)) {
                for (const file of req.files) {
                    if (file.path && fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                }
            }

            return res.status(500).json({
                success: false,
                message: "Error uploading documents",
                error: error.message
            });
        }
    }


    ,
    /* ==================== GET ALL DOCUMENTS ==================== */
    getDocuments: async (req: Request, res: Response) => {
        try {
            const registration_number = toStringParam(req.params.registration_number);
            const regNumber = Number(registration_number);

            const candidate = await CandidateModel.findOne({
                registration_number: regNumber
            }) as Candidate | null;

            if (!candidate) {
                return res.status(404).json({
                    success: false,
                    message: "Candidate not found"
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    registration_number,
                    documents: candidate.documents?.required_documents ?? []
                }
            });

        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: "Error fetching documents",
                error: error.message
            });
        }
    },

    /* ==================== GET SINGLE DOCUMENT ==================== */
    getDocument: async (req: Request, res: Response) => {
        try {
            const registration_number = toStringParam(req.params.registration_number);
            const document_type = toStringParam(req.params.document_type);
            const filename = toStringParam(req.params.filename);

            const filePath = path.join(
                process.cwd(),
                "uploads",
                "documents",
                registration_number,
                document_type,
                filename
            );

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({
                    success: false,
                    message: "File not found"
                });
            }

            return res.sendFile(filePath);

        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: "Error retrieving document",
                error: error.message
            });
        }
    },

    /* ==================== DELETE DOCUMENT ==================== */
    deleteDocument: async (req: Request, res: Response) => {
        try {
            const registration_number = toStringParam(req.params.registration_number);
            const document_type = toStringParam(req.params.document_type);
            const filename = toStringParam(req.params.filename);

            const regNumber = Number(registration_number);

            const candidate = await CandidateModel.findOne({
                registration_number: regNumber
            }) as Candidate | null;

            if (!candidate || !candidate.documents) {
                return res.status(404).json({
                    success: false,
                    message: "Candidate or documents not found"
                });
            }

            candidate.documents.required_documents =
                candidate.documents.required_documents.filter(
                    (doc) =>
                        !(doc.document_type === document_type &&
                            doc.uploaded_url.includes(filename))
                );

            await candidate.save();

            const filePath = path.join(
                process.cwd(),
                "uploads",
                "documents",
                registration_number,
                document_type,
                filename
            );

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            return res.status(200).json({
                success: true,
                message: "Document deleted successfully"
            });

        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: "Error deleting document",
                error: error.message
            });
        }
    },

    /* ==================== VERIFY DOCUMENT ==================== */
    verifyDocument: async (req: Request, res: Response) => {
        try {
            const registration_number = toStringParam(req.params.registration_number);
            const document_type = toStringParam(req.params.document_type);
            const filename = toStringParam(req.params.filename);

            const { verified, remarks } = req.body;
            const regNumber = Number(registration_number);

            const candidate = await CandidateModel.findOne({
                registration_number: regNumber
            }) as Candidate | null;

            if (!candidate || !candidate.documents) {
                return res.status(404).json({
                    success: false,
                    message: "Candidate or documents not found"
                });
            }

            const docIndex =
                candidate.documents.required_documents.findIndex(
                    (doc) =>
                        doc.document_type === document_type &&
                        doc.uploaded_url.includes(filename)
                );

            if (docIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: "Document not found"
                });
            }

            candidate.documents.required_documents[docIndex].verified =
                Boolean(verified);

            if (remarks) {
                candidate.documents.required_documents[docIndex].remarks = remarks;
            }

            await candidate.save();

            return res.status(200).json({
                success: true,
                message: "Document verification updated",
                data: candidate.documents.required_documents[docIndex]
            });

        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: "Error updating verification",
                error: error.message
            });
        }
    }
};

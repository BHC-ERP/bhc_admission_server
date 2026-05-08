import { Router } from 'express';
import {
    CheckFailureStatusResponse,
    CheckSuccessStatusResponse,
    directSaveApplication,
    getAllPayments,
    getMissedPaymentsFull,
    getPaymentStatus,
    handleCCAvenueCancel,
    handleCCAvenueResponse,
    handleDecryptionData,
    initiateAddMoreCoursesPayment,
    initiateAdmissionFeePayment,
    initiateCCAvenuePayment,
    testing_failurStatusResponse
} from '../controllers/payments/payment.controller';
const router = Router();

// Direct save for exempted candidates (NRI, Reserved, Zero Fee)
router.post('/payment/direct-save', directSaveApplication);

// CCAvenue payment flow
router.post('/payment/ccavenue/initiate', initiateCCAvenuePayment);
//Paid application add more courses
router.post('/payment/add-more-courses/initiate', initiateAddMoreCoursesPayment);
router.post('/payment/admission-fee/initiate', initiateAdmissionFeePayment);

router.post('/payment/ccavenue/response', handleCCAvenueResponse);
router.post('/payment/ccavenue/cancel', handleCCAvenueCancel);

router.post('/payment/ccavenue/decrypt/enc', handleDecryptionData);
// Payment status check(Payment check in CandidateModal)
// router.get('/payment/status/:transaction_id', getPaymentStatus);


router.get("/payment/failure/:transaction_id", CheckFailureStatusResponse);
// Payment Check in Audit_log _model
router.get("/payment/success/:transaction_id", CheckSuccessStatusResponse);

// Admin: Get all payments
router.get('/payment/all', getAllPayments);
router.get('/payment/missed-list', getMissedPaymentsFull);

export default router;
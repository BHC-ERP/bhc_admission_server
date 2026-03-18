import { Router } from 'express';
import { CheckFailureStatusResponse, CheckSuccessStatusResponse, directSaveApplication, getPaymentStatus, handleCCAvenueCancel, handleCCAvenueResponse, initiateCCAvenuePayment, testing_failurStatusResponse } from '../controllers/payments/payment.controller';
const router = Router();

// Direct save for exempted candidates (NRI, Reserved, Zero Fee)
router.post('/payment/direct-save', directSaveApplication);

// CCAvenue payment flow
router.post('/payment/ccavenue/initiate', initiateCCAvenuePayment);
router.post('/payment/ccavenue/response', handleCCAvenueResponse);
router.post('/payment/ccavenue/cancel', handleCCAvenueCancel);

// Payment status check(Payment check in CandidateModal)
// router.get('/payment/status/:transaction_id', getPaymentStatus);


router.get("/payment/failure/:transaction_id", CheckFailureStatusResponse);
// Payment Check in Audit_log _model
router.get("/payment/success/:transaction_id", CheckSuccessStatusResponse);


export default router;
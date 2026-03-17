import { Router } from 'express';
import { directSaveApplication, getPaymentStatus, handleCCAvenueCancel, handleCCAvenueResponse, initiateCCAvenuePayment, testing_failurStatusResponse, testing_successStatusResponse } from '../controllers/payments/payment.controller';
const router = Router();

// Direct save for exempted candidates (NRI, Reserved, Zero Fee)
router.post('/payment/direct-save', directSaveApplication);

// CCAvenue payment flow
router.post('/payment/ccavenue/initiate', initiateCCAvenuePayment);
router.post('/payment/ccavenue/response', handleCCAvenueResponse);
router.post('/payment/ccavenue/cancel', handleCCAvenueCancel);

// Payment status check
router.get('/payment/status/:transaction_id', getPaymentStatus);


router.get("/payment/failure/:reason", testing_failurStatusResponse);

router.get("/payment/success/:transaction_id", testing_successStatusResponse);
export default router;
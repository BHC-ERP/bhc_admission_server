import { Router } from 'express'; 
import { directSaveApplication, getPaymentStatus, handleCCAvenueCancel, handleCCAvenueResponse, initiateCCAvenuePayment } from '../controllers/payments/payment.controller';
const router = Router();

// Direct save for exempted candidates (NRI, Reserved, Zero Fee)
router.post('/payment/direct-save', directSaveApplication);

// CCAvenue payment flow
router.post('/payment/ccavenue/initiate', initiateCCAvenuePayment);
router.post('/payment/ccavenue/response', handleCCAvenueResponse);
router.post('/payment/ccavenue/cancel', handleCCAvenueCancel);

// Payment status check
router.get('/payment/status/:transaction_id', getPaymentStatus);

export default router;
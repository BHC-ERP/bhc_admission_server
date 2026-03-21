import { Request } from 'express';
import { env } from './env';

const DEV_ORIGINS = ['https://testadm.bhc.edu.in', 'http://localhost:5173'];

export interface CCAvenueConfig {
    workingKey: string;
    merchantId: string;
    accessCode: string;
    paymentUrl: string;
    frontendUrl: string;
    redirectUrl: string;
    cancelUrl: string;
}

export function getCCAvenueConfig(req: Request | { origin: string }): CCAvenueConfig {
    // If it's an Express request object, get from headers. 
    // If it's a direct origin string pass (from pendingPayments), use that.
    let originStr = '';
    
    if ('headers' in req) {
        originStr = req.headers.origin || req.headers.referer || '';
    } else {
        originStr = req.origin || '';
    }

    const isDev = DEV_ORIGINS.some(o => originStr.startsWith(o));

    if (isDev) {
        return {
            workingKey: env.CCAVENUE_WORKING_KEY_DEV,
            merchantId: env.CCAVENUE_MERCHANT_ID_DEV,
            accessCode: env.CCAVENUE_ACCESS_CODE_DEV,
            paymentUrl: env.CCAVENUE_PAYMENT_URL_DEV,
            frontendUrl: env.CCAVENUE_FRONTEND_URL_DEV,
            redirectUrl: `${env.BASE_URL}/api/secure/payment/ccavenue/response`,
            cancelUrl: `${env.BASE_URL}/api/secure/payment/ccavenue/cancel`,
        };
    }

    // Production fallback
    return {
        workingKey: env.CCAVENUE_WORKING_KEY,
        merchantId: env.CCAVENUE_MERCHANT_ID,
        accessCode: env.CCAVENUE_ACCESS_CODE,
        paymentUrl: env.CCAVENUE_PAYMENT_URL,
        frontendUrl: env.CCAVENUE_FRONTEND_URL,
        redirectUrl: `${env.BASE_URL}/api/secure/payment/ccavenue/response`,
        cancelUrl: `${env.BASE_URL}/api/secure/payment/ccavenue/cancel`,
    };
}

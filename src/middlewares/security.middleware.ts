import { Request, Response, NextFunction } from "express";

export const restrictDirectAccess = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const fetchMode = req.headers["sec-fetch-mode"];

    // 0. Whitelist of routes that ARE allowed to be accessed via browser/direct navigation
    // (example: payment gateway callbacks)
    const whitelist = [
        "/api/secure/payment/ccavenue/response",
        "/api/secure/payment/ccavenue/cancel",
        // "/api/payment/ccavenue/response",
        // "/api/payment/ccavenue/cancel"
    ];

    if (whitelist.some(path => req.originalUrl.startsWith(path))) {
        return next();
    }

    // 1. Block direct browser navigation (typing the URL in the address bar)
    // Browsers send 'navigate' when you type a URL, but 'cors' or 'no-cors' when React makes an API call.
    if (fetchMode === "navigate") {
        res.status(403).json({
            status: "error",
            message: "Direct browser access is not allowed."
        });
        return;
    }

    // 2. Block Postman & cURL (Strict Origin/Referer Check)
    // React's fetch/axios will naturally include an Origin or Referer.
    // Postman/cURL generally don't include these by default.
    if (!origin && !referer) {
        res.status(403).json({
            status: "error",
            message: "Access Denied. API must be called from the official client application."
        });
        return;
    }

    // 3. Block Postman by requiring a custom secret header
    // Your React app MUST add: axios.defaults.headers.common['x-app-source'] = 'bhc_frontend_secure_123';
    // const clientKey = req.headers["x-bhc-adm-source"];
    // if (clientKey !== "bhc_frontend_secure_123") {
    //     res.status(403).json({
    //         status: "error",
    //         message: "Access Denied. Unrecognized Source Header."
    //     });
    //     return;
    // }

    // Pass control to the next middleware
    next();
};

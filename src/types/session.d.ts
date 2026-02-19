// src/types/session.d.ts

import "express-session";

declare module "express-session" {
  interface SessionData {
    user?: {
      id: string;
      registration_number: number;
      role: string;
      payment_status?: string;
      userData?: any;
    };
  }
}

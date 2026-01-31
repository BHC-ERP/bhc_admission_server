import "express-session";
import { ObjectId } from "mongoose";

declare module "express-session" {
  interface SessionData {
    user?: {
      id: string;
      registration_number: Number;
      role?: string;
    };
  }
}

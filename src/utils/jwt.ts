import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

const JWT_SECRET: Secret = env.JWT_SECRET!;

const signOptions: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] || "1d",
};

export const signToken = (payload: object): string => {
    return jwt.sign(payload, JWT_SECRET, signOptions);
};

export const verifyToken = (token: string) => {
    return jwt.verify(token, JWT_SECRET);
};

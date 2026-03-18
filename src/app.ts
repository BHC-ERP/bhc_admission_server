import express, { Application } from "express";
import cors from "cors";
import routes from "./routes";
import { errorHandler } from "./middlewares/error.middleware";
import { corsOptions } from "./config/cors";
import { sessionMiddleware } from "./config/session";
import cookieParser from "cookie-parser";
import { restrictDirectAccess } from "./middlewares/security.middleware";

const app: Application = express();

// Middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// --- SECURITY MIDDLEWARE ---
// Block Postman and direct browser URL access
// app.use(restrictDirectAccess);

// Routes
app.use("/api", routes);

// Error handler
app.use(errorHandler);

export default app;

import express, { Application } from "express";
import cors from "cors";
import routes from "./routes";
import { errorHandler } from "./middlewares/error.middleware";
import { corsOptions } from "./config/cors";
import { sessionMiddleware } from "./config/session";
import cookieParser from "cookie-parser";

const app: Application = express();

// Middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// Routes
app.use("/api", routes);



// Error handler
app.use(errorHandler);

export default app;

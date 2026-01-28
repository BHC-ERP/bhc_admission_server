import session from "express-session";
import MongoStore from "connect-mongo";
import { env } from "./env";

export const sessionMiddleware = session({
  name: "sid",
  secret: env.SESSION_SECRET as string,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    sameSite: "lax",
  },
  store: MongoStore.create({
    mongoUrl: env.MONGO_URI,
    collectionName: "sessions",
  }),
});

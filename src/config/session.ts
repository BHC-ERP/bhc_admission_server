import session from "express-session";
import MongoStore from "connect-mongo";
import { env } from "./env";
import mongoose from "mongoose";
import { connect } from "http2";
import { connectDB } from "./database";

export const sessionMiddleware = session({
  name: "sid",
  secret: env.SESSION_SECRET as string,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    sameSite: "lax"
  },
  store: MongoStore.create({
    mongoUrl: env.MONGO_URI,
    collectionName: "sessions",
  }),
});

export const getSessionUserId = async (sid: string): Promise<string | null> => {


  const sessionsCollection = await mongoose.connection.collection("sessions");
 
  const session = await sessionsCollection.findOne({
    _id: sid as Object
  });


  if (!session) {
    console.log("Session not found");
    return null;
  }

  const parsedSession = JSON.parse(session.session);

  const userId = parsedSession?.user?.id;

  return userId;
}
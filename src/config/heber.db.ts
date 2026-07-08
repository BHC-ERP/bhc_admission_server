import mongoose from "mongoose";
import { env } from "./env";

export const heberConnection = mongoose.createConnection(
  env.MONGO_URI_HEBER_DB as string 
);

export const heberReady = new Promise<void>((resolve) => {
  if (heberConnection.readyState === 1) {
    resolve();
  } else {
    heberConnection.once("connected", resolve);
  }
});

export const getHeberDb = () => {
  return heberConnection.db ?? null;
};

heberConnection.on("connected", () => {
  console.log("✅ Heber DB connected");
});

heberConnection.on("error", (err) => {
  console.error("❌ Heber DB connection error:", err);
});

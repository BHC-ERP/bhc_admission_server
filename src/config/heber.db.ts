import mongoose from "mongoose";
import { env } from "./env";

export const heberConnection = mongoose.createConnection(
  env.MONGO_URI_HEBER_DB as string 
);

heberConnection.on("connected", () => {
  console.log("✅ Heber DB connected");
});

heberConnection.on("error", (err) => {
  console.error("❌ Heber DB connection error:", err);
});

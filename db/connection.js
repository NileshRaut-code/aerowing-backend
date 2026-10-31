//Nilesh, 31-10-2026, single MongoDB connection + safe global Mongoose settings
import mongoose from "mongoose";
import { env } from "../utils/env.js";
import { logger } from "../utils/logger.js";
import { emitIssue, Severity } from "../utils/events.js";

mongoose.set("strict", "throw"); // unknown fields on writes are an error, not silently dropped
mongoose.set("strictQuery", true); // unknown fields in filters are stripped
mongoose.set("autoIndex", !env.isProd); // prod indexes are created by provisioning, not at boot
mongoose.set("transactionAsyncLocalStorage", true); // ops inside withTransaction auto-join the session

let shuttingDown = false;

//Nilesh, 31-10-2026, connect once (requires a replica set / Atlas for transactions) + report connection loss
export const connectDB = async () => {
  mongoose.connection.on("disconnected", () => {
    if (!shuttingDown) emitIssue({ type: "db.disconnected", severity: Severity.CRITICAL, message: "MongoDB disconnected" });
  });
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  logger.info("MongoDB connected");
};

//Nilesh, 31-10-2026, close connection on shutdown (expected disconnect, no alert)
export const disconnectDB = () => {
  shuttingDown = true;
  return mongoose.disconnect();
};

//Nilesh, 31-10-2026, run fn in a transaction; every Mongoose op inside joins it automatically
export const withTransaction = (fn) => mongoose.connection.transaction(fn);

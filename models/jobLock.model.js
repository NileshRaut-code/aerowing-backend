//Nilesh, 31-10-2026, JobLock = lease lock so a batch job never runs twice at once (per job + tenant)
import mongoose from "mongoose";

const jobLockSchema = new mongoose.Schema({
  _id: { type: String }, // "<jobName>:<tenantId|platform>"
  owner: { type: String, required: true }, // host:pid:random of the holder
  lockedUntil: { type: Date, required: true },
  lastRunAt: Date,
  lastStatus: { type: String, enum: ["ok", "failed"] },
});

export const JobLock = mongoose.model("JobLock", jobLockSchema);

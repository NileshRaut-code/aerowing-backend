//Nilesh, 31-10-2026, batch-job primitives: retry, lease lock, chunked iteration
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { JobLock } from "../models/jobLock.model.js";

//Nilesh, 31-10-2026, promise sleep
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

//Nilesh, 31-10-2026, retry with exponential backoff + jitter (fn must be idempotent)
export const withRetry = async (fn, { retries = 3, baseMs = 500, onRetry = () => {} } = {}) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries) throw err;
      onRetry(err, attempt + 1);
      await sleep(baseMs * 2 ** attempt + Math.random() * baseMs);
    }
  }
};

//Nilesh, 31-10-2026, take a lease lock; returns owner token or null if another runner holds it
export const acquireLock = async (key, ttlMs) => {
  const owner = `${hostname()}:${process.pid}:${randomUUID()}`;
  const now = new Date();
  try {
    const lock = await JobLock.findOneAndUpdate(
      { _id: key, lockedUntil: { $lt: now } }, // only an expired/free lock can be taken
      { $set: { owner, lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true, returnDocument: "after" },
    ).lean();
    return lock.owner === owner ? owner : null;
  } catch (err) {
    if (err.code === 11000) return null; // lock row exists and is still held
    throw err;
  }
};

//Nilesh, 31-10-2026, extend lease while a long job is running (only the owner can)
export const extendLock = (key, owner, ttlMs) =>
  JobLock.updateOne({ _id: key, owner }, { $set: { lockedUntil: new Date(Date.now() + ttlMs) } });

//Nilesh, 31-10-2026, release lease and record the outcome (only the owner can)
export const releaseLock = (key, owner, status) =>
  JobLock.updateOne(
    { _id: key, owner },
    { $set: { lockedUntil: new Date(0), lastRunAt: new Date(), lastStatus: status } },
  );

//Nilesh, 31-10-2026, walk a collection in _id order, chunkSize docs at a time (tenant scope comes from the plugin)
export const forEachChunk = async (Model, { filter = {}, select, chunkSize = 500 }, fn) => {
  let lastId = null;
  let processed = 0;
  for (;;) {
    const where = lastId ? { ...filter, _id: { $gt: lastId } } : filter;
    const chunk = await Model.find(where).select(select).sort({ _id: 1 }).limit(chunkSize).lean();
    if (chunk.length === 0) return processed;
    await fn(chunk);
    processed += chunk.length;
    lastId = chunk.at(-1)._id;
  }
};

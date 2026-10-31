//Nilesh, 31-10-2026, tiny job runner: tenant-scoped, locked (no double runs), retried, stoppable on shutdown
import { env } from "./env.js";
import { logger } from "./logger.js";
import { Tenant } from "../models/tenant.model.js";
import { runAsPlatform, runWithTenant } from "../db/tenantContext.js";
import { acquireLock, extendLock, releaseLock, withRetry } from "./jobUtils.js";
import { emitIssue, Severity } from "./events.js";

//Nilesh, 31-10-2026, declare a job; run({ log }) must be idempotent because it can be retried
export const defineJob = ({ name, everyMs, lockTtlMs = 5 * 60_000, retries = 3, run }) =>
  Object.freeze({ name, everyMs, lockTtlMs, retries, run });

//Nilesh, 31-10-2026, vendor VMs only run jobs while their tenant is active
const tenantIsActive = async () =>
  !env.isVendor || (await Tenant.exists({ _id: env.TENANT_ID, status: "active" })) !== null;

//Nilesh, 31-10-2026, same scope as HTTP requests: vendor VM → its tenant, AISPL → platform
const inScope = (fn) => (env.isVendor ? runWithTenant(env.TENANT_ID, fn) : runAsPlatform(fn));

//Nilesh, 31-10-2026, one locked execution of a job
export const runJobOnce = async (job) => {
  const key = `${job.name}:${env.isVendor ? env.TENANT_ID : "platform"}`;
  const log = logger.child({ job: job.name });
  if (!(await tenantIsActive())) return log.debug("skipped: tenant not active");

  const owner = await acquireLock(key, job.lockTtlMs);
  if (!owner) return log.debug("skipped: lock held by another runner");

  const heartbeat = setInterval(() => extendLock(key, owner, job.lockTtlMs).catch(() => {}), job.lockTtlMs / 2);
  let status = "failed";
  try {
    await inScope(() =>
      withRetry(() => job.run({ log }), {
        retries: job.retries,
        onRetry: (err, n) => log.warn({ err }, `retry ${n}`),
      }),
    );
    status = "ok";
  } catch (err) {
    log.error({ err }, "job failed");
    emitIssue({ type: "job.failed", severity: Severity.ERROR, err, context: { job: job.name, retries: job.retries } });
  } finally {
    clearInterval(heartbeat);
    await releaseLock(key, owner, status);
  }
};

//Nilesh, 31-10-2026, schedule jobs; returns stop() that clears timers and waits for in-flight runs
export const startJobs = (jobs) => {
  const inFlight = new Set();
  const timers = jobs.map((job) => {
    let running = false; // no overlap inside this process
    const tick = () => {
      if (running) return;
      running = true;
      const p = runJobOnce(job).finally(() => {
        running = false;
        inFlight.delete(p);
      });
      inFlight.add(p);
    };
    return setInterval(tick, job.everyMs).unref();
  });
  return async () => {
    timers.forEach(clearInterval);
    await Promise.allSettled([...inFlight]);
  };
};

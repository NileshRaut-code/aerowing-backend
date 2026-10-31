//Nilesh, 31-10-2026, entry: notifiers → DB → tenant pin → HTTP + jobs → graceful shutdown
import { env } from "./utils/env.js";
import { logger } from "./utils/logger.js";
import { emitIssue, registerIssueNotifiers, Severity } from "./utils/events.js";
import { connectDB, disconnectDB } from "./db/connection.js";
import { Tenant } from "./models/tenant.model.js";
import { startJobs } from "./utils/job.js";
import { createApp } from "./app.js";

// register batch jobs here, e.g. [defineJob({ name: "sync-bookings", everyMs: 60_000, run })]
const JOBS = [];

//Nilesh, 31-10-2026, vendor VM: make sure its Tenant row exists (created pending, never auto-activated) and matches the env domain
const ensurePinnedTenant = async () => {
  const tenant = await Tenant.findOneAndUpdate(
    { _id: env.TENANT_ID },
    { $setOnInsert: { domain: env.TENANT_DOMAIN, status: "pending" } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  if (tenant.domain !== env.TENANT_DOMAIN) throw new Error("TENANT_DOMAIN does not match the provisioned tenant");
};

//Nilesh, 31-10-2026, crash safety net: report, then exit so the process manager restarts a clean process
const crash = (type) => (err) => {
  logger.fatal({ err }, type);
  emitIssue({ type, severity: Severity.CRITICAL, err });
  setTimeout(() => process.exit(1), 500).unref(); // give notifiers a moment
};

//Nilesh, 31-10-2026, boot sequence
const start = async () => {
  registerIssueNotifiers();
  process.on("unhandledRejection", crash("process.unhandled_rejection"));
  process.on("uncaughtException", crash("process.uncaught_exception"));

  await connectDB();
  if (env.isVendor) await ensurePinnedTenant();

  const server = createApp().listen(env.PORT, () =>
    logger.info({ port: env.PORT, kind: env.DEPLOYMENT_KIND }, "Server started"),
  );
  const stopJobs = startJobs(JOBS);

  //Nilesh, 31-10-2026, stop accepting traffic, finish jobs, close DB, exit (force after 10s)
  const shutdown = async (signal) => {
    logger.info({ signal }, "Shutting down");
    setTimeout(() => process.exit(1), 10_000).unref();
    await new Promise((resolve) => server.close(resolve));
    await stopJobs();
    await disconnectDB();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
};

start().catch(crash("process.startup_failed"));

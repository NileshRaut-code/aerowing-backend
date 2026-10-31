//Nilesh, 31-10-2026, issue event bus: any layer emits, notifiers (Slack/mail — dummy for now) subscribe
import { EventEmitter } from "node:events";
import { hostname } from "node:os";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { getTenantId } from "../db/tenantContext.js";

const bus = new EventEmitter();
const ISSUE = "issue";

export const Severity = Object.freeze({ WARN: "warn", ERROR: "error", CRITICAL: "critical" });

//Nilesh, 31-10-2026, emit an issue; enriched with tenant/deployment/time, never throws into the caller
export const emitIssue = ({ type, severity = Severity.ERROR, message, err, context = {} }) => {
  try {
    bus.emit(ISSUE, {
      type,
      severity,
      message: message ?? err?.message ?? type,
      stack: err?.stack?.split("\n").slice(0, 6).join("\n"),
      tenantId: getTenantId() ?? (env.isVendor ? env.TENANT_ID : undefined),
      deployment: env.DEPLOYMENT_KIND,
      host: hostname(),
      at: new Date().toISOString(),
      context,
    });
  } catch (e) {
    logger.error({ err: e }, "emitIssue failed");
  }
};

//Nilesh, 31-10-2026, DUMMY Slack notifier — replace body with a webhook POST later
const sendSlack = async (issue) => logger.warn({ notify: "slack", issue }, `[dummy-slack] ${issue.severity}: ${issue.type}`);

//Nilesh, 31-10-2026, DUMMY mail notifier — replace body with SES/SMTP later
const sendMail = async (issue) => logger.warn({ notify: "mail", issue }, `[dummy-mail] ${issue.severity}: ${issue.type}`);

// severity → channels
const ROUTES = Object.freeze({
  [Severity.WARN]: [sendSlack],
  [Severity.ERROR]: [sendSlack],
  [Severity.CRITICAL]: [sendSlack, sendMail],
});

// same type+message is sent at most once per window (stops alert storms)
const DEDUPE_MS = 60_000;
const lastSent = new Map();

//Nilesh, 31-10-2026, true if this issue was already notified inside the dedupe window
const isDuplicate = (issue) => {
  const key = `${issue.type}|${issue.message}`;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < DEDUPE_MS) return true;
  lastSent.set(key, now);
  if (lastSent.size > 1000) lastSent.clear(); // bounded memory
  return false;
};

//Nilesh, 31-10-2026, subscribe notifiers once at boot; a failing notifier never crashes the app
export const registerIssueNotifiers = () => {
  bus.on(ISSUE, (issue) => {
    if (isDuplicate(issue)) return;
    for (const send of ROUTES[issue.severity] ?? []) {
      send(issue).catch((err) => logger.error({ err }, "notifier failed"));
    }
  });
};

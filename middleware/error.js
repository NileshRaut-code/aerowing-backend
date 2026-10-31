//Nilesh, 31-10-2026, 404 + global error handler (Express 5 forwards async throws here, no try/catch wrappers)
import { ErrorCode } from "../utils/AppError.js";
import { sendError } from "../utils/response.js";
import { logger } from "../utils/logger.js";
import { emitIssue, Severity } from "../utils/events.js";

//Nilesh, 31-10-2026, map known library errors to safe API errors
const normalize = (err) => {
  if (err.isAppError) return err;
  if (err.code === 11000) return { status: 409, code: ErrorCode.CONFLICT, message: "Duplicate value" };
  if (err.name === "CastError" || err.name === "ValidationError" || err.name === "StrictModeError") {
    return { status: 400, code: ErrorCode.VALIDATION, message: "Invalid data" };
  }
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError" || err.name === "NotBeforeError") {
    return { status: 401, code: ErrorCode.UNAUTHORIZED, message: "Authentication required" };
  }
  if (err.type === "entity.parse.failed") return { status: 400, code: ErrorCode.VALIDATION, message: "Malformed JSON" };
  if (err.type === "entity.too.large") return { status: 413, code: ErrorCode.VALIDATION, message: "Payload too large" };
  return { status: 500, code: ErrorCode.INTERNAL, message: "Internal server error" };
};

//Nilesh, 31-10-2026, raise an issue event for server faults and every tenant-isolation violation
const reportIssue = (err, e, req) => {
  const isolation = e.code === ErrorCode.TENANT_CONTEXT;
  if (!isolation && e.status < 500) return;
  emitIssue({
    type: isolation ? "security.tenant_isolation" : "http.server_error",
    severity: isolation ? Severity.CRITICAL : Severity.ERROR,
    err,
    context: { method: req.method, path: req.path, reqId: req.id, status: e.status, actorId: req.actor?.id },
  });
};

//Nilesh, 31-10-2026, unknown route
export const notFoundHandler = (req, res) =>
  sendError(res, { status: 404, code: ErrorCode.NOT_FOUND, message: "Route not found" });

//Nilesh, 31-10-2026, last middleware: log + emit server errors, never leak stack/internal messages
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  const e = normalize(err);
  if (e.status >= 500) logger.error({ err, reqId: req.id }, "Unhandled error");
  reportIssue(err, e, req);
  sendError(res, e);
};

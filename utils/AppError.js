//Nilesh, 31-10-2026, function-based app error + stable error codes (no classes)

export const ErrorCode = Object.freeze({
  VALIDATION: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  TENANT_NOT_ACTIVE: "TENANT_NOT_ACTIVE",
  TENANT_CONTEXT: "TENANT_CONTEXT_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL_ERROR",
});

//Nilesh, 31-10-2026, create a throwable error the global handler knows how to render
export const AppError = (status, code, message, details) =>
  Object.assign(new Error(message), { isAppError: true, status, code, details });

//Nilesh, 31-10-2026, short helpers for the most common cases
export const notFound = (what = "Resource") => AppError(404, ErrorCode.NOT_FOUND, `${what} not found`);
export const forbidden = (msg = "Forbidden") => AppError(403, ErrorCode.FORBIDDEN, msg);
export const unauthorized = (msg = "Authentication required") => AppError(401, ErrorCode.UNAUTHORIZED, msg);
export const conflict = (msg) => AppError(409, ErrorCode.CONFLICT, msg);

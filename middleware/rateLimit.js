//Nilesh, 31-10-2026, rate limiter factory (global + stricter per-route), errors go through the global handler
import rateLimit from "express-rate-limit";
import { AppError, ErrorCode } from "../utils/AppError.js";

//Nilesh, 31-10-2026, usage: createRateLimiter({ windowMs: 60_000, limit: 100 })
export const createRateLimiter = ({ windowMs, limit }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res, next) => next(AppError(429, ErrorCode.RATE_LIMITED, "Too many requests")),
  });

// brute-force protection for login / signup / registration
export const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, limit: 20 });

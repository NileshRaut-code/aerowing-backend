//Nilesh, 31-10-2026, shared pino logger (secrets/cookies redacted)
import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.isProd ? "info" : "debug",
  redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]', "*.password", "*.passwordHash"],
});

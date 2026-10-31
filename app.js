//Nilesh, 31-10-2026, Express app: security → parsing → tenant scope → routes → errors
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { env } from "./utils/env.js";
import { logger } from "./utils/logger.js";
import { sendSuccess } from "./utils/response.js";
import { createRateLimiter } from "./middleware/rateLimit.js";
import { sameOriginGuard } from "./middleware/auth.js";
import { platformScope, resolveTenant } from "./middleware/tenant.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { vendorRouter } from "./routes/vendor.routes.js";
import { platformRouter } from "./routes/platform.routes.js";

//Nilesh, 31-10-2026, build the app for this deployment kind (vendor VM or AISPL platform)
export const createApp = () => {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(createRateLimiter({ windowMs: 60_000, limit: 100 }));
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/health", (req, res) => sendSuccess(res, { status: "ok" }));

  // every API route runs inside a scope: vendor VM → tenant (env pin), AISPL → platform; neither mounts the other's routes
  const api = env.isVendor ? [resolveTenant, vendorRouter] : [platformScope, platformRouter];
  app.use("/api/v1", sameOriginGuard, ...api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

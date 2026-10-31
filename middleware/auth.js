//Nilesh, 31-10-2026, cookie-only JWT auth + same-origin guard for state-changing requests
import { env } from "../utils/env.js";
import { forbidden, unauthorized } from "../utils/AppError.js";
import { COOKIE_NAME, verifyAccessToken } from "../utils/token.js";
import { permissionsFor } from "../utils/permissions.js";
import { User } from "../models/user.model.js";
import { Admin } from "../models/admin.model.js";

//Nilesh, 31-10-2026, factory: verify cookie JWT, then load the live actor from DB (role/status never trusted from token)
const requireAuth = (kind, loadActor) => async (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw unauthorized();

  const claims = verifyAccessToken(token); // jwt errors → 401 in error handler
  if (claims.kind !== kind) throw unauthorized();

  const actor = await loadActor(claims.sub);
  if (!actor || actor.status !== "active") throw unauthorized();

  req.actor = { id: String(actor._id), kind, role: actor.role, permissions: permissionsFor(actor.role) };
  next();
};

// vendor VM: User lookup is tenant-scoped by the plugin → a token for another tenant's user finds nothing
export const requireUser = requireAuth("user", (id) => User.findById(id).select("role status").lean());
// AISPL platform: admins only
export const requireAdmin = requireAuth("admin", (id) => Admin.findById(id).select("role status").lean());

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

//Nilesh, 31-10-2026, CSRF defence in depth (on top of SameSite=Strict): unsafe browser requests must come from an allowed origin
export const sameOriginGuard = (req, res, next) => {
  const origin = req.get("origin");
  if (!SAFE_METHODS.has(req.method) && origin && !env.CORS_ORIGINS.includes(origin)) {
    throw forbidden("Origin not allowed");
  }
  next();
};

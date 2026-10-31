//Nilesh, 31-10-2026, JWT issue/verify + HttpOnly cookie helpers (token never in body/query/localStorage)
import jwt from "jsonwebtoken";
import { env } from "./env.js";

export const COOKIE_NAME = "access_token";
const ISSUER = "aerowing-crm";
const ALG = "HS256";

// vendor tokens are bound to this VM's tenant; platform tokens to the AISPL portal
export const AUDIENCE = env.isVendor ? `tenant:${env.TENANT_ID}` : "aispl-platform";

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: "strict",
  path: "/",
});

//Nilesh, 31-10-2026, sign minimal claims only (sub + kind); role is always re-read from DB
export const signAccessToken = (sub, kind) =>
  jwt.sign({ kind }, env.JWT_SECRET, {
    subject: String(sub),
    audience: AUDIENCE,
    issuer: ISSUER,
    algorithm: ALG,
    expiresIn: `${env.JWT_TTL_MINUTES}m`,
  });

//Nilesh, 31-10-2026, verify with pinned alg/issuer/audience (throws JsonWebTokenError on failure)
export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_SECRET, { algorithms: [ALG], issuer: ISSUER, audience: AUDIENCE });

//Nilesh, 31-10-2026, set / clear the auth cookie
export const setAuthCookie = (res, token) =>
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: env.JWT_TTL_MINUTES * 60_000 });
export const clearAuthCookie = (res) => res.clearCookie(COOKIE_NAME, cookieOptions());

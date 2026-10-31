//Nilesh, 31-10-2026, AISPL admin portal routes (platform deployment only — no tenant scope, no tenant business data)
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAdmin } from "../middleware/auth.js";
import { authorize } from "../middleware/rbac.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { idParams } from "../utils/validators.js";
import { P } from "../utils/permissions.js";
import * as auth from "../controller/auth.controller.js";
import * as admin from "../controller/admin.controller.js";

export const platformRouter = Router();

platformRouter.post("/auth/login", authLimiter, validate({ body: auth.loginSchema }), auth.loginAdmin);
platformRouter.post("/auth/logout", auth.logout);

// everything below needs a signed-in admin; each route declares its permission
platformRouter.use(requireAdmin);
platformRouter.get("/auth/me", auth.meAdmin);

platformRouter.get("/vendors", authorize(P.VENDOR_LIST), validate({ query: admin.listVendorsQuery }), admin.listVendors);
platformRouter.get("/vendors/:id", authorize(P.VENDOR_LIST), validate({ params: idParams }), admin.getVendor);
platformRouter.post("/vendors/:id/approve", authorize(P.VENDOR_REVIEW), validate({ params: idParams }), admin.approveVendor);
platformRouter.post("/vendors/:id/reject", authorize(P.VENDOR_REVIEW), validate({ params: idParams, body: admin.reasonSchema }), admin.rejectVendor);

platformRouter.post("/tenants/:id/suspend", authorize(P.TENANT_LIFECYCLE), validate({ params: idParams, body: admin.reasonSchema }), admin.suspendTenant);
platformRouter.post("/tenants/:id/reactivate", authorize(P.TENANT_LIFECYCLE), validate({ params: idParams, body: admin.optionalReasonSchema }), admin.reactivateTenant);

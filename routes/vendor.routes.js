//Nilesh, 31-10-2026, vendor VM routes (vendor portal + customer layer); mounted after resolveTenant
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireActiveTenant } from "../middleware/tenant.js";
import { requireUser } from "../middleware/auth.js";
import { authorize } from "../middleware/rbac.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { idParams } from "../utils/validators.js";
import { P } from "../utils/permissions.js";
import * as auth from "../controller/auth.controller.js";
import * as vendor from "../controller/vendor.controller.js";
import * as user from "../controller/user.controller.js";

export const vendorRouter = Router();

// 1) open while tenant is pending: status + one-time registration
vendorRouter.get("/tenant/status", vendor.getTenantStatus);
vendorRouter.post("/vendor/register", authLimiter, validate({ body: vendor.registerVendorSchema }), vendor.registerVendor);
vendorRouter.post("/auth/logout", auth.logout);

// 2) everything below needs an AISPL-approved (active) tenant
vendorRouter.use(requireActiveTenant);
vendorRouter.post("/auth/login", authLimiter, validate({ body: auth.loginSchema }), auth.loginUser);
vendorRouter.post("/auth/customer/signup", authLimiter, validate({ body: auth.customerSignupSchema }), auth.customerSignup);

// 3) everything below needs a signed-in user of this tenant; each route declares its permission
vendorRouter.use(requireUser);
vendorRouter.get("/auth/me", auth.meUser);
vendorRouter.get("/vendor/me", authorize(P.VENDOR_READ), vendor.getMyVendor);

vendorRouter.get("/users", authorize(P.USER_READ), validate({ query: user.listUsersQuery }), user.listUsers);
vendorRouter.get("/users/:id", authorize(P.USER_READ), validate({ params: idParams }), user.getUser);
vendorRouter.post("/users", authorize(P.USER_WRITE), validate({ body: user.createUserSchema }), user.createUser);
vendorRouter.patch("/users/:id", authorize(P.USER_WRITE), validate({ params: idParams, body: user.updateUserSchema }), user.updateUser);
vendorRouter.delete("/users/:id", authorize(P.USER_DELETE), validate({ params: idParams }), user.deleteUser);

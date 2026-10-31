//Nilesh, 31-10-2026, vendor VM: tenant status + one-time vendor registration (tenant stays pending until AISPL approves)
import { z } from "zod";
import { env } from "../utils/env.js";
import { email, name, password, phone, strict } from "../utils/validators.js";
import { sendSuccess } from "../utils/response.js";
import { conflict, forbidden, notFound } from "../utils/AppError.js";
import { hashPassword, safeEqual } from "../utils/password.js";
import { withTransaction } from "../db/connection.js";
import { loadPinnedTenant } from "../middleware/tenant.js";
import { toTenantDTO } from "../models/tenant.model.js";
import { Vendor, toVendorDTO } from "../models/vendor.model.js";
import { User } from "../models/user.model.js";

// strict: a client-sent tenantId/status/role is rejected, not ignored
export const registerVendorSchema = strict({
  registrationCode: z.string().min(16).max(128),
  companyName: z.string().trim().min(2).max(160),
  contactName: name,
  email,
  phone,
  address: z.string().trim().max(500).optional(),
  taxId: z.string().trim().max(32).optional(),
  owner: strict({ name, email, password }),
});

//Nilesh, 31-10-2026, public: lets the FE show "pending approval / active / suspended / rejected"
export const getTenantStatus = async (req, res) => {
  const vendor = await Vendor.findOne().select("status rejectionReason").lean(); // plugin scopes to this tenant
  return sendSuccess(res, {
    tenant: toTenantDTO(req.tenant),
    registration: vendor ? { status: vendor.status, rejectionReason: vendor.rejectionReason } : null,
  });
};

//Nilesh, 31-10-2026, register vendor + owner atomically; only once, only while tenant is pending, only with the VM's code
export const registerVendor = async (req, res) => {
  const { registrationCode, owner, ...profile } = req.valid.body;
  if (!safeEqual(registrationCode, env.REGISTRATION_CODE)) throw forbidden("Invalid registration code");

  const tenant = await loadPinnedTenant({ fresh: true });
  if (tenant.status !== "pending") throw conflict(`Tenant is ${tenant.status}; registration is closed`);

  const passwordHash = await hashPassword(owner.password);
  const vendor = await withTransaction(async () => {
    // tenantId stamped by the plugin; unique index on Vendor.tenantId → a second registration fails with 409
    const [created] = await Vendor.create([profile]);
    await User.create([{ name: owner.name, email: owner.email, role: "owner", passwordHash }]);
    return created;
  });

  return sendSuccess(res, toVendorDTO(vendor), { status: 201, message: "Registration submitted for AISPL approval" });
};

//Nilesh, 31-10-2026, authenticated vendor staff: own vendor profile
export const getMyVendor = async (req, res) => {
  const vendor = await Vendor.findOne().lean(); // plugin scopes to this tenant
  if (!vendor) throw notFound("Vendor");
  return sendSuccess(res, toVendorDTO(vendor));
};

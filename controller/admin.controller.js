//Nilesh, 31-10-2026, AISPL platform: review vendor registrations + tenant lifecycle (control plane only, no tenant business data)
import { z } from "zod";
import { listQuery, strict } from "../utils/validators.js";
import { paginate } from "../utils/listing.js";
import { sendSuccess } from "../utils/response.js";
import { conflict, notFound } from "../utils/AppError.js";
import { withTransaction } from "../db/connection.js";
import { Tenant, toTenantDTO } from "../models/tenant.model.js";
import { Vendor, VENDOR_STATUS, toVendorDTO } from "../models/vendor.model.js";

export const listVendorsQuery = listQuery(["createdAt", "companyName", "status"], {
  status: z.enum(VENDOR_STATUS).optional(),
});
export const reasonSchema = strict({ reason: z.string().trim().min(3).max(500) });
export const optionalReasonSchema = strict({ reason: z.string().trim().min(3).max(500).optional() });

//Nilesh, 31-10-2026, list registrations (server-side paging/search/sort)
export const listVendors = async (req, res) => {
  const { status, ...query } = req.valid.query;
  const data = await paginate(Vendor, {
    query,
    filter: status ? { status } : {},
    searchFields: ["companyName", "contactName", "email"],
    select: "tenantId companyName contactName email phone status createdAt",
    toDTO: toVendorDTO,
  });
  return sendSuccess(res, data);
};

//Nilesh, 31-10-2026, one registration
export const getVendor = async (req, res) => {
  const vendor = await Vendor.findById(req.valid.params.id).lean();
  if (!vendor) throw notFound("Vendor");
  return sendSuccess(res, toVendorDTO(vendor));
};

//Nilesh, 31-10-2026, compare-and-set tenant status (race-safe: only moves from the expected state)
const setTenantStatus = async (tenantId, from, to, actorId, reason) => {
  const tenant = await Tenant.findOneAndUpdate(
    { _id: tenantId, status: from },
    { $set: { status: to, statusChangedAt: new Date(), statusChangedBy: actorId, ...(reason && { statusReason: reason }) } },
    { returnDocument: "after" },
  ).lean();
  if (!tenant) throw conflict(`Tenant is not ${from}`);
  return tenant;
};

//Nilesh, 31-10-2026, approve/reject factory: vendor pending→to and tenant pending→active|rejected in one transaction
const reviewVendor = (to) => async (req, res) => {
  const reason = req.valid.body?.reason;
  const vendor = await withTransaction(async () => {
    const v = await Vendor.findOneAndUpdate(
      { _id: req.valid.params.id, status: "pending" },
      { $set: { status: to, reviewedBy: req.actor.id, reviewedAt: new Date(), ...(reason && { rejectionReason: reason }) } },
      { returnDocument: "after" },
    ).lean();
    if (!v) throw conflict("Vendor is not pending review");
    await setTenantStatus(v.tenantId, "pending", to === "approved" ? "active" : "rejected", req.actor.id, reason);
    return v;
  });
  return sendSuccess(res, toVendorDTO(vendor), { message: `Vendor ${to}` });
};

export const approveVendor = reviewVendor("approved");
export const rejectVendor = reviewVendor("rejected");

//Nilesh, 31-10-2026, lifecycle factory: suspend active tenants / reactivate suspended ones (only with an approved vendor)
const lifecycle = (from, to) => async (req, res) => {
  const { id } = req.valid.params;
  const tenant = await withTransaction(async () => {
    if (to === "active" && !(await Vendor.exists({ tenantId: id, status: "approved" }))) {
      throw conflict("Vendor is not approved");
    }
    return setTenantStatus(id, from, to, req.actor.id, req.valid.body?.reason);
  });
  return sendSuccess(res, toTenantDTO(tenant), { message: `Tenant ${to}` });
};

export const suspendTenant = lifecycle("active", "suspended");
export const reactivateTenant = lifecycle("suspended", "active");

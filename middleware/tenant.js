//Nilesh, 31-10-2026, scope resolvers (vendor tenant pin / AISPL platform) + active-tenant gate
import { env } from "../utils/env.js";
import { AppError, ErrorCode } from "../utils/AppError.js";
import { Tenant } from "../models/tenant.model.js";
import { runAsPlatform, runWithTenant } from "../db/tenantContext.js";

let cache = { promise: null, at: 0 };

//Nilesh, 31-10-2026, load this VM's tenant with a short TTL cache; concurrent requests share one DB call
export const loadPinnedTenant = ({ fresh = false } = {}) => {
  if (fresh || !cache.promise || Date.now() - cache.at >= env.TENANT_CACHE_TTL_MS) {
    const promise = Tenant.findById(env.TENANT_ID)
      .lean()
      .then((tenant) => {
        if (!tenant) throw AppError(503, ErrorCode.TENANT_CONTEXT, "Tenant is not provisioned");
        return tenant;
      });
    cache = { promise, at: Date.now() };
    promise.catch(() => {
      if (cache.promise === promise) cache = { promise: null, at: 0 }; // never cache a failure
    });
  }
  return cache.promise;
};

//Nilesh, 31-10-2026, request host must belong to the pinned tenant's domain (blocks host-header / mis-routed traffic)
const hostAllowed = (hostname, domain) =>
  [domain, `www.${domain}`, `api.${domain}`].includes(String(hostname).toLowerCase());

//Nilesh, 31-10-2026, vendor VM: resolve tenant from env pin only and open the tenant scope for the rest of the request
export const resolveTenant = async (req, res, next) => {
  const tenant = await loadPinnedTenant();
  if (env.ENFORCE_TENANT_HOST && !hostAllowed(req.hostname, tenant.domain)) {
    throw AppError(421, ErrorCode.TENANT_CONTEXT, "Host does not belong to this tenant");
  }
  req.tenant = tenant;
  runWithTenant(tenant._id, next);
};

//Nilesh, 31-10-2026, AISPL platform: open the platform scope (only platformAccess models are reachable)
export const platformScope = (req, res, next) => runAsPlatform(next);

//Nilesh, 31-10-2026, gate: everything after this runs only for an approved (active) tenant
export const requireActiveTenant = (req, res, next) => {
  if (req.tenant?.status !== "active") {
    throw AppError(403, ErrorCode.TENANT_NOT_ACTIVE, `Tenant is ${req.tenant?.status ?? "unknown"}; access is blocked`);
  }
  next();
};

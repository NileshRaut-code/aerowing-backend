//Nilesh, 31-10-2026, request/job scope via AsyncLocalStorage: { tenantId } on vendor VMs, { platform } on AISPL (never from client input)
import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";
import { AppError, ErrorCode } from "../utils/AppError.js";

const als = new AsyncLocalStorage();

//Nilesh, 31-10-2026, open a scope; refuses to silently switch scope when nested
const enter = (store, fn) => {
  const current = als.getStore();
  if (current && (current.tenantId !== store.tenantId || current.platform !== store.platform)) {
    throw AppError(500, ErrorCode.TENANT_CONTEXT, "Nested scope switch is not allowed");
  }
  return als.run(Object.freeze(store), fn);
};

//Nilesh, 31-10-2026, vendor scope: every tenant-owned query is filtered to this tenant
export const runWithTenant = (tenantId, fn) => enter({ tenantId: String(tenantId), platform: false }, fn);

//Nilesh, 31-10-2026, AISPL control-plane scope: only models that opt in (platformAccess) are reachable
export const runAsPlatform = (fn) => enter({ tenantId: undefined, platform: true }, fn);

//Nilesh, 31-10-2026, current scope / tenant id (undefined when outside any scope)
export const getScope = () => als.getStore();
export const getTenantId = () => als.getStore()?.tenantId;

//Nilesh, 31-10-2026, current tenant as ObjectId; throws outside a tenant scope
export const requireTenantObjectId = () => {
  const id = getTenantId();
  if (!id) throw AppError(500, ErrorCode.TENANT_CONTEXT, "Tenant context is required for this operation");
  return new mongoose.Types.ObjectId(id);
};

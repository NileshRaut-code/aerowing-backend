//Nilesh, 31-10-2026, Mongoose plugin: every tenant-owned model is auto-scoped to the ALS tenant (no manual tenantId filters anywhere)
import { AppError, ErrorCode } from "../utils/AppError.js";
import { getScope, requireTenantObjectId } from "./tenantContext.js";

const QUERY_OPS = [
  "find", "findOne", "countDocuments", "distinct",
  "updateOne", "updateMany", "findOneAndUpdate", "findOneAndDelete",
  "deleteOne", "deleteMany",
];

// replace ops would drop tenantId from the stored doc; the rest cannot be scoped reliably
const BLOCKED_OPS = ["replaceOne", "findOneAndReplace", "bulkWrite", "estimatedDocumentCount"];

// stages/operators that could read other collections, write out, or run server-side JS
const FORBIDDEN_KEYS = new Set([
  "$lookup", "$graphLookup", "$unionWith", "$out", "$merge",
  "$where", "$function", "$accumulator",
]);

const deny = (msg) => AppError(500, ErrorCode.TENANT_CONTEXT, msg);

//Nilesh, 31-10-2026, deep-scan a filter/pipeline/update for forbidden operators
const assertSafe = (value, label) => {
  if (Array.isArray(value)) return value.forEach((v) => assertSafe(v, label));
  if (!value || typeof value !== "object" || value._bsontype) return;
  for (const [key, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw deny(`${key} is not allowed in ${label} on tenant data`);
    assertSafe(v, label);
  }
};

//Nilesh, 31-10-2026, tenantId is immutable: reject any update that touches it
const assertNoTenantInUpdate = (update) => {
  for (const doc of [].concat(update ?? {})) {
    for (const [key, v] of Object.entries(doc)) {
      if (key === "tenantId") throw deny("tenantId cannot be updated");
      if (key.startsWith("$") && v && typeof v === "object" && "tenantId" in v) throw deny("tenantId cannot be updated");
    }
  }
};

/**
 * //Nilesh, 31-10-2026, plugin entry
 * platformAccess: false (default) → only reachable inside a tenant scope (vendor VM)
 * platformAccess: true            → AISPL platform scope may also read/update it unfiltered (control-plane data, e.g. Vendor)
 * Each model declares its own index starting with tenantId.
 */
export const tenantPlugin = (schema, { platformAccess = false } = {}) => {
  schema.add({ tenantId: { type: "ObjectId", ref: "Tenant", required: true, immutable: true } });

  //Nilesh, 31-10-2026, tenant ObjectId to filter by, null for allowed platform access, otherwise fail closed
  const resolveScope = () => {
    const scope = getScope();
    if (scope?.platform) {
      if (platformAccess) return null;
      throw deny("Platform scope cannot access this tenant data");
    }
    return requireTenantObjectId();
  };

  //Nilesh, 31-10-2026, queries: AND the tenant filter in; also covers findById/exists/doc.deleteOne()
  schema.pre(QUERY_OPS, { document: false, query: true }, function scopeQuery() {
    const tenantId = resolveScope();
    assertSafe(this.getFilter(), "query");
    const update = this.getUpdate();
    if (update) {
      assertNoTenantInUpdate(update);
      assertSafe(update, "update");
    }
    if (tenantId) this.where({ tenantId });
  });

  //Nilesh, 31-10-2026, unscopable ops are never allowed
  for (const op of BLOCKED_OPS) {
    schema.pre(op, function blockOp() {
      throw deny(`${op} is not allowed on tenant data`);
    });
  }

  //Nilesh, 31-10-2026, aggregate: prepend $match on tenant and block cross-collection stages
  schema.pre("aggregate", function scopeAggregate() {
    const tenantId = resolveScope();
    assertSafe(this.pipeline(), "aggregate");
    if (tenantId) this.pipeline().unshift({ $match: { tenantId } });
  });

  //Nilesh, 31-10-2026, save: stamp tenant on insert, refuse cross-tenant saves
  // runs on validate (before `required` check) and again on save (in case validation is skipped)
  function scopeDocument() {
    const tenantId = resolveScope();
    if (!tenantId) return; // platform: existing control-plane docs keep their own tenantId
    if (this.isNew && !this.tenantId) this.tenantId = tenantId;
    if (!tenantId.equals(this.tenantId)) throw deny("Cross-tenant save blocked");
  }
  schema.pre("validate", scopeDocument);
  schema.pre("save", scopeDocument);

  //Nilesh, 31-10-2026, insertMany: stamp every doc with the current tenant (platform cannot bulk-create tenant data)
  schema.pre("insertMany", function scopeInsertMany(docs) {
    const tenantId = requireTenantObjectId();
    for (const doc of [].concat(docs)) doc.tenantId = tenantId;
  });
};

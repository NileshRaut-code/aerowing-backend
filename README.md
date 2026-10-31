# Multi-tenant core — reference solution (Nilesh, 31-10-2026)

The same isolation guarantees as the main backend, in a flatter, function-based style:
plain JS (ESM), Express 5, one MongoDB, a Mongoose **tenant plugin** in place of a repository layer.

## Deployment model

| Deployment | `DEPLOYMENT_KIND` | Serves | Tenant |
|---|---|---|---|
| Vendor VM (1 per vendor, FE+BE, own domain e.g. `abc.com`) | `vendor` | vendor portal + customer APIs | pinned by `TENANT_ID` in env |
| AISPL admin portal | `platform` | vendor review, tenant lifecycle | none (control plane only) |

All deployments share one MongoDB. The client never sends a tenant id.

## Lifecycle flow

```
deploy VM (TENANT_ID, TENANT_DOMAIN, REGISTRATION_CODE)
  └─ server.js upserts Tenant { status: pending }
vendor:  POST /api/v1/vendor/register   (code + company + owner)  → Vendor pending + owner User (one transaction)
         every other vendor/customer API → 403 TENANT_NOT_ACTIVE
AISPL:   POST /api/v1/vendors/:id/approve → Vendor approved + Tenant active (one transaction, compare-and-set)
         POST /api/v1/vendors/:id/reject  → Vendor rejected + Tenant rejected
vendor:  within TENANT_CACHE_TTL_MS everything unlocks (login, users, customer signup …)
AISPL:   /tenants/:id/suspend | /reactivate (reactivate needs an approved vendor)
```

## Security layers (request order on a vendor VM)

1. **helmet, CORS allowlist, global rate limit, 2 MB JSON limit**: `app.js`
2. **Same-origin guard**: unsafe methods with a foreign `Origin` are rejected (CSRF, on top of `SameSite=Strict`). `middleware/auth.js`
3. **Tenant resolver**: tenant comes from the env pin only. The request `Host` must be the tenant domain, then an AsyncLocalStorage scope opens. `middleware/tenant.js`, `db/tenantContext.js`
4. **Active-tenant gate**: only `/tenant/status`, `/vendor/register` and `/auth/logout` work while pending. `middleware/tenant.js`
5. **Auth**: JWT only from an **HttpOnly cookie**, with pinned alg/issuer. The audience is bound to `tenant:<id>`, so a token from another VM is rejected. The actor and role are reloaded from the DB on every request. `middleware/auth.js`, `utils/token.js`
6. **RBAC, deny by default**: every protected route declares `authorize(P.X)`. Permissions resolve server-side from `utils/permissions.js`, and an unknown role gets nothing. `middleware/rbac.js`
7. **Zod strict validation**: unknown keys (`tenantId`, `role`, `status` …) are rejected, not ignored. Parsed data goes to `req.valid`. `middleware/validate.js`
8. **Tenant plugin (data layer)**: applied to every tenant-owned schema (`User`, `Vendor`, and future `Booking`, `Lead` …). Business code never writes a `tenantId` filter. `db/tenantPlugin.js`
   - vendor VM scope `{ tenantId }`: every op is filtered and stamped with that tenant
   - AISPL scope `{ platform }`: only models with `platformAccess: true` (Vendor) are reachable, unfiltered, for review. `User` and other business data throw.
   - `replaceOne`/`findOneAndReplace` are blocked because they would drop `tenantId`
   - all find/count/distinct/update/delete/findOneAnd* → `AND tenantId = <ALS tenant>`
   - `aggregate` → `$match` prepended. `$lookup/$unionWith/$graphLookup/$out/$merge/$where/$function` are blocked
   - `save`/`insertMany` → tenant stamped; cross-tenant save is blocked; `tenantId` is immutable in updates
   - `bulkWrite`, `estimatedDocumentCount` → blocked
   - **no tenant context → throws** (fail closed). The platform deployment therefore cannot read vendor business data at all.
   - Inside `runWithTenant(id, fn)`, `await` the query within `fn`. A Query returned un-awaited executes outside the scope and is rejected.
9. **Mongoose globals**: `strict: "throw"`, `strictQuery`, and transactions with automatic session propagation. `db/connection.js`
10. **Errors**: one envelope. Express 5 forwards async throws natively, so there are no try/catch wrappers. Stack traces and internals are never leaked. `middleware/error.js`
11. **Issue events**: `emitIssue()` is called for 5xx errors, isolation violations, job failures, DB disconnects and crashes. Repeats within 60 s are deduplicated, then the issue goes to Slack/mail (dummy notifiers for now). `utils/events.js`

Registry models (`Tenant` is the tenant itself; `Admin` and `JobLock` belong to no tenant) are not plugin-scoped.
A vendor VM reads only its own `Tenant` by the env pin.

See **ARCHITECTURE.md** for diagrams of every flow.

## Folder map

```
server.js            DB connect, tenant pin upsert, HTTP, jobs, graceful shutdown
app.js               middleware chain + routers per deployment kind
db/                  connection.js · tenantContext.js (ALS) · tenantPlugin.js
models/              tenant · vendor + user (tenant-owned, plugin) · admin · jobLock
controller/          auth · vendor (register/status) · admin (approve/reject/lifecycle) · user (CRUD + list)
routes/              vendor.routes.js · platform.routes.js   (wiring only)
middleware/          tenant · auth · rbac · validate · rateLimit · error
utils/               env · AppError · response · listing · validators · permissions · password · token · logger · events · job · jobUtils
scripts/createAdmin.js  first AISPL admin (no public admin signup)
```

## Conventions

- Response `{ success, message, data }`. Error `{ success:false, message, error:{ code } }`. Throw `AppError(status, code, msg)`.
- Lists: `paginate(Model, { query, filter, searchFields, select, toDTO })` returns
  `{ items, pagination:{ page, pageSize, total, totalPages } }`. Search is regex-escaped, `sortBy` is allowlisted, and `pageSize` is at most 100.
- DTO mappers live next to each model (`toUserDTO` …). Raw documents are never returned.
- Money (future modules): integer minor units (`priceMinor`) + `currency`.
- New tenant-owned model = `schema.plugin(tenantPlugin)` + a compound index starting with `tenantId`.

## Batch jobs

```js
// server.js → JOBS
defineJob({
  name: "disable-stale-customers",
  everyMs: 60 * 60_000,
  run: ({ log }) =>
    forEachChunk(User, { filter: { role: "customer" }, chunkSize: 500 }, async (rows) => { /* idempotent work */ }),
});
```

Each run is:

- **locked**: a lease in `JobLock` keyed `name:tenantId`, with a heartbeat. A second VM replica skips the run.
- **tenant-scoped**: it runs inside `runWithTenant(TENANT_ID)`, and only while the tenant is active.
- **chunked**: it walks the data by keyset `_id`.
- **retried**: exponential backoff with jitter.
- **stoppable**: on SIGTERM, shutdown waits for in-flight runs.

## Run

```bash
cp .env.example .env          # MongoDB must be a replica set (transactions)
npm i && npm run dev          # vendor VM
ADMIN_PASSWORD=... npm run create-admin -- admin@aispl.com "AISPL Admin" superadmin   # on a platform env
```

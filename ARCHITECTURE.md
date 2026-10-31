# Architecture design: multi-tenant travel CRM core

*Nilesh, 31-10-2026. This is a reference design for review. The code is in this folder; diagrams use Mermaid and render on GitHub, GitLab and VS Code.*

**Goal:** each vendor's data stays isolated and correct, and the code a developer has to write stays as small as possible.
**Idea:**
- **1 vendor = 1 VM** with a tenant pin in its env.
- **One shared MongoDB.**
- **One Mongoose plugin** scopes every query automatically, so business code never writes a `tenantId` filter.

---

## 1. Deployment view

```mermaid
flowchart LR
  subgraph V1["Vendor VM: abc.com (TENANT_ID=A)"]
    FE1[Vendor + Customer FE] --> BE1[API: DEPLOYMENT_KIND=vendor]
  end
  subgraph V2["Vendor VM: xyz.com (TENANT_ID=B)"]
    FE2[Vendor + Customer FE] --> BE2[API: DEPLOYMENT_KIND=vendor]
  end
  subgraph P["AISPL admin portal"]
    FE3[Admin FE] --> BE3[API: DEPLOYMENT_KIND=platform]
  end
  BE1 --> DB[(Single MongoDB<br/>replica set)]
  BE2 --> DB
  BE3 --> DB
  BE1 & BE2 & BE3 -. issue events .-> N[Slack / Mail]
```

| Layer | Who uses it | Deployment | Data it can reach |
|---|---|---|---|
| Vendor portal | owner, manager, marketing, support | vendor VM | only its own tenant |
| Customer | customers of that vendor | vendor VM (same domain) | only its own tenant |
| AISPL admin | superadmin, reviewer | platform | control plane only (Tenant, Vendor, Admin). It is **blocked** from vendor business data. |

---

## 2. Code layers

```mermaid
flowchart TB
  S[server.js<br/>boot, notifiers, shutdown] --> A[app.js<br/>middleware chain]
  A --> R[routes/<br/>wiring only]
  R --> M[middleware/<br/>tenant · auth · rbac · validate · rateLimit · error]
  R --> C[controller/<br/>thin handlers + Zod schemas]
  C --> MO[models/<br/>schemas + DTO mappers]
  MO --> P[db/tenantPlugin.js<br/>auto tenant scoping]
  P --> X[db/tenantContext.js<br/>AsyncLocalStorage scope]
  C --> U[utils/<br/>listing · response · AppError · events · job · token · password]
```

The dependency rule is that layers only point downward. Controllers never write tenant filters, and models never read `req`.

---

## 3. Request pipeline (vendor VM)

Every request passes these gates in order. The first one that fails sends its error response and the request stops there.

```mermaid
flowchart TD
  IN([HTTP request]) --> G1{helmet · CORS · rate limit<br/>JSON ≤ 2MB}
  G1 -- too many --> E429[429 RATE_LIMITED]
  G1 --> G2{Unsafe method from<br/>a foreign Origin?}
  G2 -- yes --> E403a[403 FORBIDDEN]
  G2 -- no --> G3[resolveTenant<br/>tenant = env TENANT_ID only]
  G3 -- not provisioned --> E503[503 TENANT_CONTEXT 🔔]
  G3 -- Host ≠ tenant domain --> E421[421 TENANT_CONTEXT 🔔]
  G3 --> SCOPE[[ALS scope opened: tenantId=A]]
  SCOPE --> PUB{Public route?<br/>status · register · logout}
  PUB -- yes --> H[Controller]
  PUB -- no --> G4{Tenant active?}
  G4 -- pending/suspended/rejected --> E403b[403 TENANT_NOT_ACTIVE]
  G4 -- yes --> LOGIN{login / signup?}
  LOGIN -- yes --> H
  LOGIN -- no --> G5{Valid HttpOnly cookie JWT<br/>aud = tenant:A, user active in DB?}
  G5 -- no --> E401[401 UNAUTHORIZED]
  G5 --> G6{authorize: role has the permission?<br/>resolved server-side}
  G6 -- no --> E403c[403 FORBIDDEN]
  G6 --> G7{Zod strict validation}
  G7 -- invalid / unknown key e.g. tenantId --> E400[400 VALIDATION_ERROR]
  G7 --> H
  H --> PL[[Mongoose tenant plugin<br/>adds tenantId = A to every DB op]]
  PL --> OK([200/201 success envelope])
  H -- throws --> EH[Global error handler<br/>5xx & isolation → 🔔 issue event]
```

On the platform deployment, `resolveTenant` is replaced by `platformScope`, which opens the scope `{ platform: true }`. The rest of the chain is the same: `requireAdmin` and then `authorize(...)`.

---

## 4. Tenant lifecycle

```mermaid
stateDiagram-v2
  [*] --> pending: VM boots (server.js upserts Tenant)
  pending --> pending: vendor registers (Vendor pending + owner user)
  pending --> active: AISPL approve
  pending --> rejected: AISPL reject (reason)
  active --> suspended: AISPL suspend (reason)
  suspended --> active: AISPL reactivate (vendor must be approved)
  rejected --> [*]
```

Every move is a **compare-and-set** (`findOneAndUpdate({ status: from })`) inside a **transaction** with the Vendor update. Two admins clicking at the same time cannot both succeed, and Tenant and Vendor can never disagree.

| Tenant status | Vendor/customer APIs | Registration |
|---|---|---|
| pending | ❌ 403 TENANT_NOT_ACTIVE | ✅ once, needs `REGISTRATION_CODE` |
| active | ✅ | ❌ 409 |
| suspended | ❌ 403 | ❌ 409 |
| rejected | ❌ 403 | ❌ 409 |

---

## 5. Onboarding flow: register, then approve

```mermaid
sequenceDiagram
  autonumber
  actor V as Vendor (abc.com)
  participant VB as Vendor VM API
  participant DB as MongoDB
  actor AD as AISPL admin
  participant PB as Platform API

  Note over VB,DB: Deploy: env TENANT_ID=A, TENANT_DOMAIN=abc.com, REGISTRATION_CODE
  VB->>DB: upsert Tenant{_id:A, status:pending}
  V->>VB: POST /api/v1/vendor/register
  VB->>VB: check code (constant-time), tenant must be pending
  VB->>DB: TX: Vendor.create + User.create(owner)  [plugin stamps tenantId=A]
  VB-->>V: 201 "Registration submitted"
  V->>VB: POST /api/v1/auth/login
  VB-->>V: 403 TENANT_NOT_ACTIVE
  AD->>PB: GET /api/v1/vendors?status=pending
  PB-->>AD: 200 { items, pagination }
  AD->>PB: POST /api/v1/vendors/:id/approve
  PB->>DB: TX: Vendor pending→approved, Tenant pending→active
  PB-->>AD: 200 "Vendor approved"
  Note over VB: tenant cache expires (≤15 s)
  V->>VB: POST /api/v1/auth/login
  VB-->>V: 200 + Set-Cookie access_token (HttpOnly, Secure, SameSite=Strict)
```

**Request and response examples**

```http
POST /api/v1/vendor/register
{ "registrationCode": "…", "companyName": "ABC Travels", "contactName": "Asha",
  "email": "ops@abc.com", "phone": "+91 98765 43210",
  "owner": { "name": "Asha", "email": "asha@abc.com", "password": "••••••••••" } }

201 { "success": true, "message": "Registration submitted for AISPL approval",
      "data": { "id": "…", "tenantId": "A", "companyName": "ABC Travels", "status": "pending", … } }

403 { "success": false, "message": "Tenant is pending; access is blocked", "error": { "code": "TENANT_NOT_ACTIVE" } }
```

---

## 6. Authenticated request: list users

```mermaid
sequenceDiagram
  autonumber
  actor U as Manager (abc.com)
  participant MW as Middleware chain
  participant C as user.controller
  participant P as tenantPlugin
  participant DB as MongoDB
  U->>MW: GET /api/v1/users?page=1&pageSize=20&search=ra&sortBy=name&sortOrder=asc (cookie)
  MW->>MW: tenant A scope · active · JWT(aud tenant:A) · load user → role=manager
  MW->>MW: authorize(user:read) ✅ · Zod listQuery ✅ → req.valid
  C->>P: User.find({ $or:[name~/ra/i, email~/ra/i] }) + countDocuments
  P->>DB: same filter AND tenantId=A
  DB-->>C: rows (projection = table fields only)
  C-->>U: 200 { items:[UserDTO], pagination:{ page:1, pageSize:20, total:43, totalPages:3 } }
```

The search text is regex-escaped, `sortBy` must be on an allowlist, `pageSize` is at most 100, and `_id` is the tie-breaker so ordering is stable.

---

## 7. How isolation is enforced (tenant plugin)

```mermaid
flowchart TD
  Q[Any model operation] --> T{Model uses tenantPlugin?}
  T -- no: Tenant/Admin/JobLock<br/>registry models --> RAW[runs as written]
  T -- yes: User, Vendor, future Booking/Lead… --> SC{ALS scope?}
  SC -- none --> X1[❌ throw TENANT_CONTEXT 🔔]
  SC -- platform --> PA{model platformAccess?}
  PA -- no e.g. User --> X2[❌ throw: platform cannot read tenant data 🔔]
  PA -- yes e.g. Vendor --> CP[control-plane access, no filter]
  SC -- tenant A --> OP{operation}
  OP -- find/count/update/delete --> F[AND tenantId = A]
  OP -- aggregate --> AG["prepend $match tenantId=A<br/>block $lookup/$unionWith/$out/$merge"]
  OP -- save/insertMany --> ST[stamp tenantId=A<br/>block cross-tenant save]
  OP -- update touching tenantId --> X3[❌ immutable]
  OP -- bulkWrite/replace/estimatedCount --> X4[❌ blocked]
  OP -- "$where/$function anywhere" --> X5[❌ blocked]
```

This gives **defence in depth**:
1. Zod rejects any `tenantId` the client sends.
2. The tenant comes only from the env pin.
3. The JWT audience is bound to the tenant.
4. The plugin filters every operation and fails closed.
5. Compound indexes start with `tenantId`.

Known limits:
- `Model.collection` or the raw driver bypasses the plugin. It is forbidden by convention, so add a lint rule for it.
- Run queries with `await` *inside* the scope.

---

## 8. Error and case handling

All errors use the same envelope: `{ success:false, message, error:{ code } }`. Stack traces and internal messages never reach the client. 🔔 means an issue event is emitted.

| Case | Status | Code | 🔔 |
|---|---|---|---|
| Zod invalid body/query/params, unknown key | 400 | VALIDATION_ERROR | |
| Malformed JSON / Cast / Mongoose validation | 400 | VALIDATION_ERROR | |
| Body > 2 MB | 413 | VALIDATION_ERROR | |
| No/expired/foreign-tenant JWT, disabled user | 401 | UNAUTHORIZED | |
| Missing permission, foreign Origin, bad registration code | 403 | FORBIDDEN | |
| Tenant pending/suspended/rejected | 403 | TENANT_NOT_ACTIVE | |
| Record not in this tenant (even if the id exists elsewhere) | 404 | NOT_FOUND | |
| Duplicate (email in tenant, 2nd registration), wrong state transition | 409 | CONFLICT | |
| Host not tenant domain | 421 | TENANT_CONTEXT | ✅ critical |
| Rate limit | 429 | RATE_LIMITED | |
| Tenant row missing | 503 | TENANT_CONTEXT | ✅ critical |
| Isolation violation in code (no scope, platform→tenant data, blocked op) | 500 | TENANT_CONTEXT | ✅ critical |
| Any other unhandled error | 500 | INTERNAL_ERROR | ✅ error |
| Job failed after retries | n/a | n/a | ✅ error |
| MongoDB disconnected, uncaught exception, startup failure | n/a | n/a | ✅ critical |

---

## 9. Issue events (Slack / mail)

```mermaid
flowchart LR
  E1[errorHandler<br/>5xx + isolation] --> BUS((emitIssue))
  E2[job runner<br/>job.failed] --> BUS
  E3[db connection<br/>db.disconnected] --> BUS
  E4[process<br/>uncaught / startup] --> BUS
  BUS --> EN[enrich: tenantId, deployment, host, time, short stack]
  EN --> DD{same type+message<br/>in last 60 s?}
  DD -- yes --> DROP[drop, no alert storm]
  DD -- no --> RT{severity}
  RT -- warn/error --> SL[sendSlack: dummy]
  RT -- critical --> SL & ML[sendMail: dummy]
```

`emitIssue` never throws into the caller, and a notifier failure is only logged. To go live, replace the bodies of `sendSlack` and `sendMail` in `utils/events.js` with a webhook call and SES/SMTP.

---

## 10. Batch jobs

```mermaid
flowchart TD
  TK[interval tick] --> RUN{already running<br/>in this process?}
  RUN -- yes --> SKIP1[skip]
  RUN -- no --> ACT{tenant active?}
  ACT -- no --> SKIP2[skip]
  ACT -- yes --> LK{acquire lease lock<br/>JobLock name:tenantId}
  LK -- held by other replica --> SKIP3[skip]
  LK -- got it --> SC[[run inside tenant scope<br/>heartbeat extends lease]]
  SC --> CH[forEachChunk: keyset by _id, 500/chunk]
  CH --> RT{error?}
  RT -- yes, retries left --> BK[backoff 2^n + jitter] --> SC
  RT -- yes, exhausted --> FAIL[lastStatus=failed 🔔 job.failed]
  RT -- no --> DONE[lastStatus=ok]
  FAIL & DONE --> REL[release lock]
```

Job handlers must be **idempotent**, because a retry can run the same chunk twice. On SIGTERM the runner stops scheduling new runs and waits for in-flight ones.

---

## 11. API surface

| Deployment | Method & path | Auth / permission | Gate |
|---|---|---|---|
| vendor | GET `/tenant/status` | public | — |
| vendor | POST `/vendor/register` | registration code, rate-limited | pending only |
| vendor | POST `/auth/login` · `/auth/customer/signup` | rate-limited | active |
| vendor | POST `/auth/logout` · GET `/auth/me` | cookie | active (me) |
| vendor | GET `/vendor/me` | `vendor:read` | active |
| vendor | GET `/users` · GET `/users/:id` | `user:read` | active |
| vendor | POST `/users` · PATCH `/users/:id` | `user:write` (not owner, not self role/status) | active |
| vendor | DELETE `/users/:id` | `user:delete` (not owner, not self) | active |
| platform | POST `/auth/login` · `/auth/logout` · GET `/auth/me` | admin cookie | — |
| platform | GET `/vendors` · `/vendors/:id` | `platform:vendor:list` | — |
| platform | POST `/vendors/:id/approve` · `/reject` | `platform:vendor:review` | vendor pending |
| platform | POST `/tenants/:id/suspend` · `/reactivate` | `platform:tenant:lifecycle` | CAS on status |

**Roles and permissions** are defined once in `utils/permissions.js`. An unknown role gets no permissions.

| Role | Permissions |
|---|---|
| owner | vendor:read · user:read · user:write · user:delete |
| manager | vendor:read · user:read · user:write |
| support | vendor:read · user:read |
| marketing | vendor:read |
| customer | none (own profile via `/auth/me`) |
| superadmin | vendor list/review · tenant lifecycle |
| reviewer | vendor list/review |

---

## 12. Adding a new tenant feature (e.g. Booking)

1. `models/booking.model.js`: add `schema.plugin(tenantPlugin)` and an index starting with `{ tenantId: 1, … }`. Store money as `amountMinor` plus `currency`.
2. `controller/booking.controller.js`: write strict Zod schemas and thin handlers. Use `paginate()` for the list. Never write a `tenantId` filter.
3. `utils/permissions.js`: add the keys and map them to roles.
4. `routes/vendor.routes.js`: wire each route as `authorize(P.X), validate({...}), handler`, after `requireUser`.

Isolation, the error envelope, alerts and pagination come automatically.

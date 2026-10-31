//Nilesh, 31-10-2026, permission keys + role→permission map, defined once and resolved server-side only

export const P = Object.freeze({
  // vendor deployment
  VENDOR_READ: "vendor:read",
  USER_READ: "user:read",
  USER_WRITE: "user:write",
  USER_DELETE: "user:delete",
  // AISPL platform deployment
  VENDOR_LIST: "platform:vendor:list",
  VENDOR_REVIEW: "platform:vendor:review",
  TENANT_LIFECYCLE: "platform:tenant:lifecycle",
});

// staff roles a vendor can assign; "owner" is created once at registration, "customer" via signup
export const STAFF_ROLES = Object.freeze(["manager", "marketing", "support"]);
export const USER_ROLES = Object.freeze(["owner", ...STAFF_ROLES, "customer"]);
export const ADMIN_ROLES = Object.freeze(["superadmin", "reviewer"]);

const ROLE_PERMISSIONS = {
  owner: [P.VENDOR_READ, P.USER_READ, P.USER_WRITE, P.USER_DELETE],
  manager: [P.VENDOR_READ, P.USER_READ, P.USER_WRITE],
  marketing: [P.VENDOR_READ],
  support: [P.VENDOR_READ, P.USER_READ],
  customer: [],
  superadmin: [P.VENDOR_LIST, P.VENDOR_REVIEW, P.TENANT_LIFECYCLE],
  reviewer: [P.VENDOR_LIST, P.VENDOR_REVIEW],
};

// built once at boot (not per request)
const ROLE_SETS = new Map(Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => [role, Object.freeze(new Set(perms))]));
const NONE = Object.freeze(new Set());

//Nilesh, 31-10-2026, deny-by-default: unknown role → empty set
export const permissionsFor = (role) => ROLE_SETS.get(role) ?? NONE;

//Nilesh, 31-10-2026, reusable Zod building blocks (all request schemas are strict → unknown keys like tenantId are rejected)
import { z } from "zod";

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
export const email = z.email().max(254).transform((v) => v.toLowerCase());
export const password = z.string().min(10).max(128);
export const name = z.string().trim().min(1).max(120);
export const phone = z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, "Invalid phone");

//Nilesh, 31-10-2026, route param `:id` schema
export const idParams = z.strictObject({ id: objectId });

//Nilesh, 31-10-2026, strict object helper so every body/query rejects extra keys
export const strict = (shape) => z.strictObject(shape);

//Nilesh, 31-10-2026, list query: page, pageSize, search, sortBy (allowlisted), sortOrder + optional extra filters
export const listQuery = (sortable, extra = {}) =>
  z.strictObject({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    sortBy: z.enum(sortable).default(sortable[0]),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    ...extra,
  });

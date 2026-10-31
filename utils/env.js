//Nilesh, 31-10-2026, single Zod-validated env; the only place that reads process.env
import { z } from "zod";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "must be a 24-char hex ObjectId");
const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    MONGODB_URI: z.string().min(1),

    // vendor = one vendor VM (vendor + customer APIs); platform = AISPL admin portal
    DEPLOYMENT_KIND: z.enum(["vendor", "platform"]),

    // vendor VM pin: tenant identity never comes from the client
    TENANT_ID: objectId.optional(),
    TENANT_DOMAIN: z.string().toLowerCase().optional(),
    REGISTRATION_CODE: z.string().min(16).optional(),
    TENANT_CACHE_TTL_MS: z.coerce.number().int().min(0).default(15_000),
    ENFORCE_TENANT_HOST: bool.optional(),

    JWT_SECRET: z.string().min(32),
    JWT_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  })
  //Nilesh, 31-10-2026, vendor VMs must carry their tenant pin + one-time registration code
  .superRefine((e, ctx) => {
    if (e.DEPLOYMENT_KIND !== "vendor") return;
    for (const key of ["TENANT_ID", "TENANT_DOMAIN", "REGISTRATION_CODE"]) {
      if (!e[key]) ctx.addIssue({ code: "custom", path: [key], message: "required when DEPLOYMENT_KIND=vendor" });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

const raw = parsed.data;
export const env = Object.freeze({
  ...raw,
  isProd: raw.NODE_ENV === "production",
  isVendor: raw.DEPLOYMENT_KIND === "vendor",
  ENFORCE_TENANT_HOST: raw.ENFORCE_TENANT_HOST ?? raw.NODE_ENV === "production",
});

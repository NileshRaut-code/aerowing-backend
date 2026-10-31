//Nilesh, 31-10-2026, Tenant = one vendor deployment (control-plane model, _id is the VM's TENANT_ID)
import mongoose from "mongoose";

export const TENANT_STATUS = Object.freeze(["pending", "active", "suspended", "rejected"]);

const tenantSchema = new mongoose.Schema(
  {
    domain: { type: String, required: true, lowercase: true, trim: true, unique: true },
    status: { type: String, enum: TENANT_STATUS, default: "pending", index: true },
    statusReason: { type: String, maxlength: 500 },
    statusChangedAt: Date,
    statusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export const Tenant = mongoose.model("Tenant", tenantSchema);

//Nilesh, 31-10-2026, public-safe tenant view
export const toTenantDTO = (t) => ({ id: String(t._id), domain: t.domain, status: t.status });

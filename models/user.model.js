//Nilesh, 31-10-2026, User = vendor staff + customers; tenant-owned → scoped by tenantPlugin
import mongoose from "mongoose";
import { tenantPlugin } from "../db/tenantPlugin.js";
import { USER_ROLES } from "../utils/permissions.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    role: { type: String, enum: USER_ROLES, required: true },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

userSchema.plugin(tenantPlugin);
// email is unique per tenant, not globally (same person can be a customer of two vendors)
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, role: 1, createdAt: -1 });

export const User = mongoose.model("User", userSchema);

//Nilesh, 31-10-2026, table/profile DTO; passwordHash and tenantId never leave the API
export const USER_LIST_FIELDS = "name email phone role status createdAt";
export const toUserDTO = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  status: u.status,
  createdAt: u.createdAt,
});

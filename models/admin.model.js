//Nilesh, 31-10-2026, Admin = AISPL platform staff (platform model, only used on the platform deployment)
import mongoose from "mongoose";
import { ADMIN_ROLES } from "../utils/permissions.js";

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    role: { type: String, enum: ADMIN_ROLES, required: true },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

export const Admin = mongoose.model("Admin", adminSchema);

//Nilesh, 31-10-2026, admin DTO
export const toAdminDTO = (a) => ({ id: String(a._id), name: a.name, email: a.email, role: a.role });

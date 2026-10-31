//Nilesh, 31-10-2026, Vendor = registration/business profile of a tenant; tenant-scoped by the plugin, AISPL may review it
import mongoose from "mongoose";
import { tenantPlugin } from "../db/tenantPlugin.js";

export const VENDOR_STATUS = Object.freeze(["pending", "approved", "rejected"]);

const vendorSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true, maxlength: 160 },
    contactName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, trim: true, maxlength: 500 },
    taxId: { type: String, trim: true, maxlength: 32 },
    status: { type: String, enum: VENDOR_STATUS, default: "pending" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    reviewedAt: Date,
    rejectionReason: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

// tenantId added + enforced by the plugin; platformAccess lets the AISPL portal list/approve registrations
vendorSchema.plugin(tenantPlugin, { platformAccess: true });
vendorSchema.index({ tenantId: 1 }, { unique: true }); // exactly one vendor per tenant
vendorSchema.index({ status: 1, createdAt: -1 }); // AISPL review queue

export const Vendor = mongoose.model("Vendor", vendorSchema);

//Nilesh, 31-10-2026, vendor DTO (no internal fields)
export const toVendorDTO = (v) => ({
  id: String(v._id),
  tenantId: String(v.tenantId),
  companyName: v.companyName,
  contactName: v.contactName,
  email: v.email,
  phone: v.phone,
  address: v.address,
  taxId: v.taxId,
  status: v.status,
  rejectionReason: v.rejectionReason,
  createdAt: v.createdAt,
});

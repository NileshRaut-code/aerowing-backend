//Nilesh, 31-10-2026, vendor staff/customer management (User is tenant-scoped by the plugin — no manual tenant filters)
import { z } from "zod";
import { email, listQuery, name, password, phone, strict } from "../utils/validators.js";
import { paginate } from "../utils/listing.js";
import { sendSuccess } from "../utils/response.js";
import { forbidden, notFound } from "../utils/AppError.js";
import { hashPassword } from "../utils/password.js";
import { STAFF_ROLES, USER_ROLES } from "../utils/permissions.js";
import { User, USER_LIST_FIELDS, toUserDTO } from "../models/user.model.js";

const staffRole = z.enum(STAFF_ROLES); // "owner" and "customer" can never be assigned here
const userStatus = z.enum(["active", "disabled"]);

export const listUsersQuery = listQuery(["createdAt", "name", "email", "role"], {
  role: z.enum(USER_ROLES).optional(),
  status: userStatus.optional(),
});
export const createUserSchema = strict({ name, email, phone: phone.optional(), role: staffRole, password });
export const updateUserSchema = strict({
  name: name.optional(),
  phone: phone.optional(),
  role: staffRole.optional(),
  status: userStatus.optional(),
}).refine((b) => Object.keys(b).length > 0, "Nothing to update");

// the owner account is protected from edit/delete through these endpoints
const NOT_OWNER = { role: { $ne: "owner" } };

//Nilesh, 31-10-2026, block self role/status change and self delete (no self-escalation / lock-out)
const assertNotSelf = (req, msg) => {
  if (req.valid.params.id === req.actor.id) throw forbidden(msg);
};

//Nilesh, 31-10-2026, list users (server-side page/search/sort, table DTO only)
export const listUsers = async (req, res) => {
  const { role, status, ...query } = req.valid.query;
  const data = await paginate(User, {
    query,
    filter: { ...(role && { role }), ...(status && { status }) },
    searchFields: ["name", "email"],
    select: USER_LIST_FIELDS,
    toDTO: toUserDTO,
  });
  return sendSuccess(res, data);
};

//Nilesh, 31-10-2026, one user
export const getUser = async (req, res) => {
  const user = await User.findById(req.valid.params.id).lean();
  if (!user) throw notFound("User");
  return sendSuccess(res, toUserDTO(user));
};

//Nilesh, 31-10-2026, create staff user (tenantId stamped by plugin)
export const createUser = async (req, res) => {
  const { password: pass, ...profile } = req.valid.body;
  const user = await User.create({ ...profile, passwordHash: await hashPassword(pass) });
  return sendSuccess(res, toUserDTO(user), { status: 201, message: "User created" });
};

//Nilesh, 31-10-2026, update profile/role/status (not owner, not own role/status)
export const updateUser = async (req, res) => {
  const body = req.valid.body;
  if (body.role || body.status) assertNotSelf(req, "You cannot change your own role or status");
  const user = await User.findOneAndUpdate({ _id: req.valid.params.id, ...NOT_OWNER }, { $set: body }, { returnDocument: "after", runValidators: true }).lean();
  if (!user) throw notFound("User");
  return sendSuccess(res, toUserDTO(user), { message: "User updated" });
};

//Nilesh, 31-10-2026, delete user (not owner, not self)
export const deleteUser = async (req, res) => {
  assertNotSelf(req, "You cannot delete yourself");
  const { deletedCount } = await User.deleteOne({ _id: req.valid.params.id, ...NOT_OWNER });
  if (!deletedCount) throw notFound("User");
  return sendSuccess(res, null, { message: "User deleted" });
};

//Nilesh, 31-10-2026, login/logout/me for vendor users + AISPL admins, and customer signup (cookie-only JWT)
import { z } from "zod";
import { email, name, password, phone, strict } from "../utils/validators.js";
import { sendSuccess } from "../utils/response.js";
import { unauthorized, notFound } from "../utils/AppError.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { clearAuthCookie, setAuthCookie, signAccessToken } from "../utils/token.js";
import { User, toUserDTO } from "../models/user.model.js";
import { Admin, toAdminDTO } from "../models/admin.model.js";

// login accepts any non-empty password (policy applies on create, not on login)
export const loginSchema = strict({ email, password: z.string().min(1).max(128) });
export const customerSignupSchema = strict({ name, email, password, phone: phone.optional() });

//Nilesh, 31-10-2026, issue cookie for an actor and return its DTO
const signIn = (res, doc, kind, toDTO, status = 200) => {
  setAuthCookie(res, signAccessToken(doc._id, kind));
  return sendSuccess(res, toDTO(doc), { status, message: "Signed in" });
};

//Nilesh, 31-10-2026, login factory (same timing for unknown user / wrong password / disabled)
const makeLogin = (Model, kind, toDTO) => async (req, res) => {
  const { email: mail, password: pass } = req.valid.body;
  const doc = await Model.findOne({ email: mail }).select("+passwordHash").lean();
  const ok = await verifyPassword(pass, doc?.passwordHash ?? null);
  if (!ok || doc.status !== "active") throw unauthorized("Invalid email or password");
  return signIn(res, doc, kind, toDTO);
};

//Nilesh, 31-10-2026, "me" factory: profile of the authenticated actor
const makeMe = (Model, toDTO) => async (req, res) => {
  const doc = await Model.findById(req.actor.id).lean();
  if (!doc) throw notFound("Account");
  return sendSuccess(res, toDTO(doc));
};

// vendor VM (User model is tenant-scoped → login only finds this tenant's users)
export const loginUser = makeLogin(User, "user", toUserDTO);
export const meUser = makeMe(User, toUserDTO);
// AISPL platform
export const loginAdmin = makeLogin(Admin, "admin", toAdminDTO);
export const meAdmin = makeMe(Admin, toAdminDTO);

//Nilesh, 31-10-2026, clear auth cookie
export const logout = (req, res) => {
  clearAuthCookie(res);
  return sendSuccess(res, null, { message: "Signed out" });
};

//Nilesh, 31-10-2026, customer self-signup on the vendor domain; role is forced server-side
export const customerSignup = async (req, res) => {
  const { password: pass, ...profile } = req.valid.body;
  const user = await User.create({ ...profile, role: "customer", passwordHash: await hashPassword(pass) });
  return signIn(res, user, "user", toUserDTO, 201);
};

//Nilesh, 31-10-2026, one-off CLI to create the first AISPL admin (no public admin signup exists)
// usage: node --env-file=.env scripts/createAdmin.js <email> <name> <superadmin|reviewer>   (password read from ADMIN_PASSWORD)
import { connectDB, disconnectDB } from "../db/connection.js";
import { Admin } from "../models/admin.model.js";
import { hashPassword } from "../utils/password.js";
import { email, name, password } from "../utils/validators.js";
import { ADMIN_ROLES } from "../utils/permissions.js";

const [mail, adminName, role] = process.argv.slice(2);
const pass = process.env.ADMIN_PASSWORD; // env, not argv → not visible in shell history / process list

if (!ADMIN_ROLES.includes(role)) throw new Error(`role must be one of ${ADMIN_ROLES.join(", ")}`);

await connectDB();
await Admin.create({
  email: email.parse(mail),
  name: name.parse(adminName),
  role,
  passwordHash: await hashPassword(password.parse(pass)),
});
console.log(`Admin ${mail} created`);
await disconnectDB();

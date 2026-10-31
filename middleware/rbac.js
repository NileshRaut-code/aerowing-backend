//Nilesh, 31-10-2026, deny-by-default RBAC: route passes only if the server-resolved actor has every listed permission
import { forbidden, unauthorized } from "../utils/AppError.js";

//Nilesh, 31-10-2026, usage: router.get("/users", authorize(P.USER_READ), handler)
export const authorize =
  (...required) =>
  (req, res, next) => {
    if (!req.actor) throw unauthorized();
    if (required.length === 0 || !required.every((p) => req.actor.permissions.has(p))) {
      throw forbidden("Missing permission");
    }
    next();
  };

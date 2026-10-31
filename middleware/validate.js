//Nilesh, 31-10-2026, Zod request validation; parsed values go to req.valid (Express 5 req.query is read-only)
import { AppError, ErrorCode } from "../utils/AppError.js";

const PARTS = ["params", "query", "body"];

//Nilesh, 31-10-2026, usage: validate({ body: schema, query: schema, params: schema })
export const validate = (schemas) => (req, res, next) => {
  const valid = {};
  for (const part of PARTS) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: [part, ...i.path].join("."), message: i.message }));
      throw AppError(400, ErrorCode.VALIDATION, "Invalid request", details);
    }
    valid[part] = result.data;
  }
  req.valid = valid;
  next();
};

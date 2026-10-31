//Nilesh, 31-10-2026, one response envelope for the whole API

//Nilesh, 31-10-2026, success: { success, message, data }
export const sendSuccess = (res, data = null, { status = 200, message = "OK" } = {}) =>
  res.status(status).json({ success: true, message, data });

//Nilesh, 31-10-2026, error: { success:false, message, error:{ code, details? } } — used only by the error handler
export const sendError = (res, { status, code, message, details }) =>
  res.status(status).json({
    success: false,
    message,
    error: details ? { code, details } : { code },
  });

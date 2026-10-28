// An error we throw on purpose; the error middleware turns it into a JSON response.
export class AppError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
export const badRequest = (msg, fields) => new AppError(400, msg, fields);
export const forbidden = (msg = 'You do not have permission to do that.') => new AppError(403, msg);
export const notFound = (msg = 'Not found.') => new AppError(404, msg);
export const conflict = (msg) => new AppError(409, msg);

// Wraps async route handlers so thrown errors reach the error middleware.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

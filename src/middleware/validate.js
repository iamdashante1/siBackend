import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError, badRequest } from '../lib/errors.js';

// Parse req.body with a zod schema; on failure respond with per-field messages the UI can show.
export const parseBody = (schema, body) => {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw badRequest('Please fix the highlighted fields.', fieldErrors(result.error));
};

function fieldErrors(err) {
  const fields = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

// Router param guard: rejects ids that are not valid Mongo ObjectIds before any query runs.
export function validId(req, _res, next, value) {
  if (!mongoose.isValidObjectId(value)) return next(new AppError(404, 'Not found.'));
  next();
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: fieldErrors(err) });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'That record already exists.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That file is too large.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid request body.' });
  }
  console.error(err); // full detail stays in the server log, never in the response
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

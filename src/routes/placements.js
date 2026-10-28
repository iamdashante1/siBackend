import { Router } from 'express';
import { z } from 'zod';
import { Placement } from '../models/Placement.js';
import { Application } from '../models/Application.js';
import { ROLES } from '../lib/constants.js';
import { conflict, notFound, wrap, badRequest } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { parseBody, validId } from '../middleware/validate.js';
import { notify } from '../lib/notify.js';
import { createPlacementFor } from '../lib/placements.js';

const router = Router();
router.param('id', validId);

const populate = [
  { path: 'student', select: 'name email student' },
  { path: 'employer', select: 'name email employer' },
  { path: 'opportunity', select: 'code title type location workMode duration' },
];

router.get(
  '/',
  wrap(async (req, res) => {
    const filter = {};
    if (req.user.role === ROLES.STUDENT) filter.student = req.user._id;
    if (req.user.role === ROLES.EMPLOYER) filter.employer = req.user._id;
    const placements = await Placement.find(filter).sort({ createdAt: -1 }).populate(populate);
    res.json({ placements });
  }),
);

// Normally a placement is created automatically when a student accepts an offer.
// This lets the placement office create one for an accepted application that has none.
router.post(
  '/',
  requireRole(ROLES.ADMIN),
  wrap(async (req, res) => {
    const { applicationId } = parseBody(z.object({ applicationId: z.string().min(1) }), req.body);
    const app = await Application.findById(applicationId).catch(() => null);
    if (!app) throw notFound('Application not found.');
    const placement = await createPlacementFor(app);
    await notify(app.student, 'Placement created', 'The placement office created your placement.');
    res.status(201).json({ placement: await placement.populate(populate) });
  }),
);

// Allowed moves: pending -> confirmed -> active -> completed.
const NEXT = { p_pending: 'p_confirmed', p_confirmed: 'p_active', p_active: 'p_completed' };

router.post(
  '/:id/advance',
  requireRole(ROLES.ADMIN),
  wrap(async (req, res) => {
    const placement = await Placement.findById(req.params.id);
    if (!placement) throw notFound('Placement not found.');
    const next = NEXT[placement.status];
    if (!next) throw conflict('This placement is already completed.');
    if (next === 'p_active' && placement.startDate > new Date()) {
      throw conflict(`This placement cannot become active before its start date (${placement.startDate.toISOString().slice(0, 10)}).`);
    }
    placement.status = next;
    placement.history.push({ status: next });
    await placement.save();
    const text = { p_confirmed: 'confirmed', p_active: 'now active', p_completed: 'marked as completed' }[next];
    await notify(placement.student, 'Placement update', `Your placement was ${text}.`);
    res.json({ placement: await placement.populate(populate) });
  }),
);

const updateSchema = z.object({
  supervisorName: z.string().trim().max(100).optional(),
  supervisorEmail: z.union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email address.')]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.patch(
  '/:id',
  requireRole(ROLES.ADMIN),
  wrap(async (req, res) => {
    const data = parseBody(updateSchema, req.body);
    const placement = await Placement.findById(req.params.id);
    if (!placement) throw notFound('Placement not found.');
    if (placement.status === 'p_completed') throw conflict('A completed placement cannot be edited.');

    if (data.supervisorName !== undefined) placement.supervisor.name = data.supervisorName;
    if (data.supervisorEmail !== undefined) placement.supervisor.email = data.supervisorEmail;
    if (data.startDate) placement.startDate = new Date(`${data.startDate.slice(0, 10)}T12:00:00Z`);
    if (data.endDate) placement.endDate = new Date(`${data.endDate.slice(0, 10)}T12:00:00Z`);
    if (placement.endDate && placement.endDate <= placement.startDate) {
      throw badRequest('The end date must be after the start date.', { endDate: 'The end date must be after the start date.' });
    }
    await placement.save();
    res.json({ placement: await placement.populate(populate) });
  }),
);

// Monitoring: the placement office records progress notes.
router.post(
  '/:id/notes',
  requireRole(ROLES.ADMIN),
  wrap(async (req, res) => {
    const { text } = parseBody(z.object({ text: z.string().trim().min(1, 'Write a note.').max(1000) }), req.body);
    const placement = await Placement.findById(req.params.id);
    if (!placement) throw notFound('Placement not found.');
    placement.notes.push({ text, by: req.user.name });
    await placement.save();
    res.status(201).json({ placement: await placement.populate(populate) });
  }),
);

export default router;

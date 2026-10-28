import { Router } from 'express';
import { z } from 'zod';
import { Opportunity } from '../models/Opportunity.js';
import { Application } from '../models/Application.js';
import { User } from '../models/User.js';
import { nextCode } from '../models/Counter.js';
import { OPP_TYPES, WORK_MODES, ROLES } from '../lib/constants.js';
import { AppError, badRequest, conflict, forbidden, notFound, wrap } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { parseBody, validId } from '../middleware/validate.js';
import { notify, notifyAdmins } from '../lib/notify.js';

const router = Router();
router.param('id', validId);

const EMPLOYER_FIELDS = 'name employer.company employer.sector employer.city';
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- validation ----------
// Dates arrive as "YYYY-MM-DD" from the form; empty string means "not set".
const dateString = z
  .string()
  .trim()
  .refine((s) => s === '' || !Number.isNaN(Date.parse(s)), 'Enter a valid date.')
  .optional();

const lines = z.array(z.string().trim().min(1)).max(20).default([]);

const opportunitySchema = z.object({
  title: z.string().trim().min(3, 'Enter a title of at least 3 characters.').max(120),
  type: z.enum(OPP_TYPES).default('Internship'),
  field: z.string().trim().max(60).default(''),
  location: z.string().trim().max(120).default(''),
  workMode: z.enum(WORK_MODES).default('Hybrid'),
  startDate: dateString,
  duration: z.string().trim().max(60).default(''),
  positions: z.coerce.number().int().min(1, 'At least one position.').max(500).default(1),
  pay: z.string().trim().max(80).default(''),
  about: z.string().trim().max(3000).default(''),
  responsibilities: lines,
  requirements: lines,
  deadline: dateString,
});

// To send an opportunity for approval it must be complete and the deadline must be in the future.
function checkReadyToSubmit(o) {
  const fields = {};
  if (!o.location) fields.location = 'Enter the location.';
  if (!o.startDate) fields.startDate = 'Enter a start date.';
  if (!o.duration) fields.duration = 'Enter the duration.';
  if (!o.about) fields.about = 'Describe the role.';
  if (!o.requirements?.length) fields.requirements = 'Add at least one requirement.';
  if (!o.deadline) fields.deadline = 'Enter an application deadline.';
  else if (new Date(o.deadline) <= new Date()) fields.deadline = 'The deadline must be in the future.';
  else if (o.startDate && new Date(o.startDate) <= new Date(o.deadline)) fields.startDate = 'The start date must be after the deadline.';
  if (Object.keys(fields).length) throw badRequest('Complete the highlighted fields before submitting.', fields);
}

const toDate = (s, endOfDay) => (s ? new Date(`${s.slice(0, 10)}T${endOfDay ? '23:59:59.999' : '12:00:00'}Z`) : undefined);

function fromInput(data) {
  return {
    ...data,
    startDate: toDate(data.startDate, false),
    deadline: toDate(data.deadline, true),
  };
}

// ---------- reads ----------
router.get(
  '/',
  wrap(async (req, res) => {
    const { q, type, mode, status } = req.query;
    const filter = {};
    const role = req.user.role;

    if (role === ROLES.STUDENT) {
      filter.status = 'open';
      filter.$or = [{ deadline: { $gte: new Date() } }, { deadline: null }];
    } else if (role === ROLES.EMPLOYER) {
      filter.employer = req.user._id;
      if (status) filter.status = String(status);
    } else {
      filter.status = status ? String(status) : { $ne: 'draft' };
    }
    if (type && OPP_TYPES.includes(String(type))) filter.type = String(type);
    if (mode && WORK_MODES.includes(String(mode))) filter.workMode = String(mode);

    let opps = await Opportunity.find(filter).sort({ deadline: 1, createdAt: -1 }).populate('employer', EMPLOYER_FIELDS);

    if (q) {
      const rx = new RegExp(escapeRegex(String(q).trim()), 'i');
      opps = opps.filter((o) => [o.title, o.location, o.field, o.employer?.employer?.company].some((t) => rx.test(t || '')));
    }
    res.json({ opportunities: await withExtras(opps, req.user) });
  }),
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const opp = await loadVisible(req.params.id, req.user);
    const [withExtra] = await withExtras([opp], req.user);
    res.json({ opportunity: withExtra });
  }),
);

// Applies the visibility rule for one opportunity.
async function loadVisible(id, user) {
  const opp = await Opportunity.findById(id).populate('employer', EMPLOYER_FIELDS);
  if (!opp) throw notFound('Opportunity not found.');
  if (user.role === ROLES.EMPLOYER && String(opp.employer._id) !== String(user._id)) throw notFound('Opportunity not found.');
  if (user.role === ROLES.ADMIN && opp.status === 'draft') throw notFound('Opportunity not found.');
  if (user.role === ROLES.STUDENT && opp.status !== 'open') {
    // A student can still see a closed opportunity they applied to.
    const applied = await Application.exists({ student: user._id, opportunity: opp._id });
    if (!applied) throw notFound('Opportunity not found.');
  }
  return opp;
}

// Adds the application count (employer/admin) or the student's own application (student).
async function withExtras(opps, user) {
  const ids = opps.map((o) => o._id);
  const out = opps.map((o) => o.toJSON());
  if (user.role === ROLES.STUDENT) {
    const mine = await Application.find({ student: user._id, opportunity: { $in: ids }, status: { $ne: 'withdrawn' } }).select('opportunity');
    const byOpp = new Map(mine.map((a) => [String(a.opportunity), a]));
    return out.map((o) => ({ ...o, myApplication: byOpp.has(o.id) ? { id: String(byOpp.get(o.id)._id) } : null }));
  }
  const counts = await Application.aggregate([
    { $match: { opportunity: { $in: ids }, status: { $ne: 'withdrawn' } } },
    { $group: { _id: '$opportunity', n: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.n]));
  return out.map((o) => ({ ...o, applicationCount: map.get(o.id) || 0 }));
}

// ---------- employer writes ----------
const ownOpportunity = async (id, user) => {
  const opp = await Opportunity.findById(id);
  if (!opp || String(opp.employer) !== String(user._id)) throw notFound('Opportunity not found.');
  return opp;
};

router.post(
  '/',
  requireRole(ROLES.EMPLOYER),
  wrap(async (req, res) => {
    const submit = req.query.submit === '1';
    const data = fromInput(parseBody(opportunitySchema, req.body));
    if (submit) {
      assertVerified(req.user);
      checkReadyToSubmit(data);
    }
    const opp = await Opportunity.create({
      ...data,
      employer: req.user._id,
      code: await nextCode('OP'),
      status: submit ? 'pending_approval' : 'draft',
    });
    if (submit) await notifyAdmins('Opportunity submitted', `${req.user.employer.company} submitted ${opp.title} for approval.`);
    res.status(201).json({ opportunity: opp });
  }),
);

router.put(
  '/:id',
  requireRole(ROLES.EMPLOYER),
  wrap(async (req, res) => {
    const opp = await ownOpportunity(req.params.id, req.user);
    if (opp.status === 'closed') throw conflict('A closed opportunity cannot be edited.');
    const data = fromInput(parseBody(opportunitySchema, req.body));
    // Open and pending opportunities have already been (or are being) reviewed, so they must stay complete.
    if (opp.status !== 'draft') checkReadyToSubmit(data);
    opp.set(data);
    await opp.save();
    res.json({ opportunity: opp });
  }),
);

router.post(
  '/:id/submit',
  requireRole(ROLES.EMPLOYER),
  wrap(async (req, res) => {
    const opp = await ownOpportunity(req.params.id, req.user);
    if (opp.status !== 'draft') throw conflict('Only a draft can be submitted for approval.');
    assertVerified(req.user);
    checkReadyToSubmit(opp);
    opp.status = 'pending_approval';
    await opp.save();
    await notifyAdmins('Opportunity submitted', `${req.user.employer.company} submitted ${opp.title} for approval.`);
    res.json({ opportunity: opp });
  }),
);

router.post(
  '/:id/close',
  requireRole(ROLES.EMPLOYER, ROLES.ADMIN),
  wrap(async (req, res) => {
    const opp = await Opportunity.findById(req.params.id);
    if (!opp) throw notFound('Opportunity not found.');
    if (req.user.role === ROLES.EMPLOYER && String(opp.employer) !== String(req.user._id)) throw notFound('Opportunity not found.');
    if (opp.status !== 'open') throw conflict('Only an open opportunity can be closed.');
    opp.status = 'closed';
    await opp.save();
    res.json({ opportunity: opp });
  }),
);

router.delete(
  '/:id',
  requireRole(ROLES.EMPLOYER),
  wrap(async (req, res) => {
    const opp = await ownOpportunity(req.params.id, req.user);
    if (opp.status !== 'draft') throw conflict('Only drafts can be deleted.');
    await opp.deleteOne();
    res.json({ ok: true });
  }),
);

// ---------- admin approval ----------
router.post(
  '/:id/approve',
  requireRole(ROLES.ADMIN),
  wrap(async (req, res) => {
    const opp = await Opportunity.findById(req.params.id);
    if (!opp) throw notFound('Opportunity not found.');
    if (opp.status !== 'pending_approval') throw conflict('Only opportunities pending approval can be approved.');
    const employer = await User.findById(opp.employer);
    if (employer.status !== 'active') throw conflict('Verify this employer before approving their opportunities.');
    if (opp.deadline && opp.deadline <= new Date()) throw conflict('The application deadline has already passed.');
    opp.status = 'open';
    await opp.save();
    await notify(opp.employer, 'Opportunity approved', `${opp.title} is now visible to students.`);
    res.json({ opportunity: opp });
  }),
);

function assertVerified(user) {
  if (user.status !== 'active') {
    throw new AppError(403, 'The placement office must verify your organisation before you can submit opportunities.');
  }
}

export default router;

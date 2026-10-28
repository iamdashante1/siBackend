import { Router } from 'express';
import { z } from 'zod';
import { Application } from '../models/Application.js';
import { Opportunity } from '../models/Opportunity.js';
import { Interview } from '../models/Interview.js';
import { Placement } from '../models/Placement.js';
import { nextCode } from '../models/Counter.js';
import { ROLES, APP_STATUS } from '../lib/constants.js';
import { conflict, forbidden, notFound, wrap } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { parseBody, validId } from '../middleware/validate.js';
import { notify, notifyAdmins } from '../lib/notify.js';
import { createPlacementFor } from '../lib/placements.js';

const router = Router();
router.param('id', validId);

const populate = [
  { path: 'student', select: 'name email phone student cvInfo' },
  { path: 'opportunity', select: 'code title type location workMode startDate deadline status' },
  { path: 'employer', select: 'name email employer.company employer.sector' },
];

// ---------- who may do what ----------
// For each action: which role performs it, and which statuses it may start from.
// Everything about the application lifecycle is in this table.
const ACTIONS = {
  review: { role: ROLES.EMPLOYER, from: ['submitted'], to: 'review' },
  shortlist: { role: ROLES.EMPLOYER, from: ['submitted', 'review'], to: 'shortlisted' },
  offer: { role: ROLES.EMPLOYER, from: ['interview'], to: 'offered' },
  reject: { role: ROLES.EMPLOYER, from: ['submitted', 'review', 'shortlisted', 'interview'], to: 'rejected' },
  withdraw: { role: ROLES.STUDENT, from: ['submitted', 'review', 'shortlisted', 'interview', 'offered'], to: 'withdrawn' },
  accept: { role: ROLES.STUDENT, from: ['offered'], to: 'accepted' },
};

const eventLabel = (action, app, company) =>
  ({
    review: `Under review by ${company}`,
    shortlist: 'Shortlisted',
    offer: 'Offer made',
    reject: 'Not selected',
    withdraw: app.status === 'offered' ? 'Offer declined' : 'Application withdrawn',
    accept: 'Offer accepted',
  })[action];

// ---------- reads ----------
router.get(
  '/',
  wrap(async (req, res) => {
    const { status, opportunity } = req.query;
    const filter = {};
    if (req.user.role === ROLES.STUDENT) filter.student = req.user._id;
    if (req.user.role === ROLES.EMPLOYER) filter.employer = req.user._id;
    if (status && APP_STATUS.includes(String(status))) filter.status = String(status);
    if (opportunity) filter.opportunity = String(opportunity);

    let apps = await Application.find(filter).sort({ appliedAt: -1 }).populate(populate);
    // Employers never see withdrawn applications (the design: "the employer can no longer see this application").
    if (req.user.role === ROLES.EMPLOYER) apps = apps.filter((a) => a.status !== 'withdrawn');
    if (req.query.q) {
      const q = String(req.query.q).trim().toLowerCase();
      apps = apps.filter((a) => a.student.name.toLowerCase().includes(q));
    }
    res.json({ applications: apps });
  }),
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const app = await loadFor(req.params.id, req.user);
    const interview = await Interview.findOne({ application: app._id, status: 'scheduled' }).sort({ startsAt: 1 });
    const placement = await Placement.findOne({ application: app._id }).select('code status');
    res.json({ application: app, interview, placement });
  }),
);

async function loadFor(id, user) {
  const app = await Application.findById(id).populate(populate);
  if (!app) throw notFound('Application not found.');
  const owner = { [ROLES.STUDENT]: app.student._id, [ROLES.EMPLOYER]: app.employer._id }[user.role];
  if (user.role !== ROLES.ADMIN && String(owner) !== String(user._id)) throw notFound('Application not found.');
  if (user.role === ROLES.EMPLOYER && app.status === 'withdrawn') throw notFound('Application not found.');
  return app;
}

// ---------- student submits ----------
const submitSchema = z.object({
  opportunityId: z.string().min(1),
  coverLetter: z.string().trim().min(50, 'Write at least 50 characters.').max(4000, 'Keep it under 4000 characters.'),
});

router.post(
  '/',
  requireRole(ROLES.STUDENT),
  wrap(async (req, res) => {
    const { opportunityId, coverLetter } = parseBody(submitSchema, req.body);
    const opp = await Opportunity.findById(opportunityId).catch(() => null);
    if (!opp || opp.status !== 'open') throw notFound('This opportunity is not open for applications.');
    if (opp.deadline && opp.deadline < new Date()) throw conflict('The application deadline for this opportunity has passed.');

    const existing = await Application.findOne({ student: req.user._id, opportunity: opp._id });
    let app;
    if (existing && existing.status !== 'withdrawn') {
      throw conflict('You have already applied for this opportunity.');
    } else if (existing) {
      // Re-applying after a withdrawal reuses the record so the one-application-per-opportunity rule holds.
      existing.set({ status: 'submitted', coverLetter, appliedAt: new Date(), events: [] });
      existing.events.push({ label: 'Application submitted' });
      app = await existing.save();
    } else {
      app = await Application.create({
        code: await nextCode('APP'),
        student: req.user._id,
        opportunity: opp._id,
        employer: opp.employer,
        coverLetter,
        events: [{ label: 'Application submitted' }],
      });
    }
    await notify(opp.employer, 'New application', `${req.user.name} applied for ${opp.title}.`);
    res.status(201).json({ application: await app.populate(populate) });
  }),
);

// ---------- status changes ----------
router.post(
  '/:id/:action',
  wrap(async (req, res) => {
    const rule = ACTIONS[req.params.action];
    if (!rule) throw notFound();
    if (req.user.role !== rule.role) throw forbidden();

    const app = await loadFor(req.params.id, req.user);
    if (!rule.from.includes(app.status)) {
      throw conflict(`This application is "${app.status}", so it cannot be changed that way.`);
    }

    const company = app.employer.employer.company;
    app.events.push({ label: eventLabel(req.params.action, app, company) });
    const previous = app.status;
    app.status = rule.to;

    if (rule.to === 'accepted') {
      // Accepting an offer starts the placement. Create it first so a failure leaves the offer untouched.
      app.status = 'accepted';
      const placement = await createPlacementFor(app);
      await app.save();
      await notifyAdmins('Offer accepted', `${app.student.name} accepted an offer from ${company}.`);
      return res.json({ application: app, placement });
    }
    await app.save();

    // Side effects
    if (['rejected', 'withdrawn'].includes(rule.to)) {
      await Interview.updateMany({ application: app._id, status: 'scheduled' }, { status: 'cancelled' });
    }
    const title = app.opportunity.title;
    if (req.user.role === ROLES.EMPLOYER) {
      const messages = {
        review: ['Application under review', `${company} is reviewing your application for ${title}.`],
        shortlist: ['You were shortlisted', `${company} shortlisted you for ${title}.`],
        offer: ['Offer received', `${company} made you an offer for ${title}.`],
        reject: ['Application update', `${company} did not select your application for ${title}.`],
      }[req.params.action];
      await notify(app.student._id, ...messages);
    } else {
      await notify(app.employer._id, previous === 'offered' ? 'Offer declined' : 'Application withdrawn', `${app.student.name} withdrew from ${title}.`);
    }
    res.json({ application: app });
  }),
);

export default router;

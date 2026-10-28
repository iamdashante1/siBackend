import { Router } from 'express';
import { z } from 'zod';
import { Interview } from '../models/Interview.js';
import { Application } from '../models/Application.js';
import { ROLES, INTERVIEW_FORMATS } from '../lib/constants.js';
import { badRequest, conflict, notFound, wrap } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { parseBody, validId } from '../middleware/validate.js';
import { notify } from '../lib/notify.js';

const router = Router();
router.param('id', validId);

const INTERVIEW_MINUTES = 45;
const populate = [
  { path: 'student', select: 'name' },
  { path: 'employer', select: 'name email employer.company' },
  { path: 'application', select: 'code status opportunity', populate: { path: 'opportunity', select: 'title code' } },
];

router.get(
  '/',
  requireRole(ROLES.STUDENT, ROLES.EMPLOYER),
  wrap(async (req, res) => {
    const mine = req.user.role === ROLES.STUDENT ? { student: req.user._id } : { employer: req.user._id };
    const interviews = await Interview.find(mine).sort({ startsAt: 1 }).populate(populate);
    let toSchedule = [];
    if (req.user.role === ROLES.EMPLOYER) {
      // Shortlisted candidates who still need an interview slot.
      const scheduled = await Interview.distinct('application', { employer: req.user._id, status: 'scheduled' });
      toSchedule = await Application.find({ employer: req.user._id, status: 'shortlisted', _id: { $nin: scheduled } })
        .populate('student', 'name')
        .populate('opportunity', 'title code');
    }
    res.json({ interviews, toSchedule });
  }),
);

const scheduleSchema = z.object({
  applicationId: z.string().min(1),
  startsAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Choose a valid date and time.'),
  format: z.enum(INTERVIEW_FORMATS).default('Video call'),
  details: z.string().trim().max(500).optional(),
});

router.post(
  '/',
  requireRole(ROLES.EMPLOYER),
  wrap(async (req, res) => {
    const data = parseBody(scheduleSchema, req.body);
    const startsAt = new Date(data.startsAt);
    if (startsAt <= new Date()) throw badRequest('Choose a date and time in the future.', { startsAt: 'Choose a date and time in the future.' });

    const app = await Application.findOne({ _id: data.applicationId, employer: req.user._id }).populate('opportunity', 'title');
    if (!app) throw notFound('Application not found.');
    if (!['review', 'shortlisted', 'interview'].includes(app.status)) {
      throw conflict('Interviews can only be scheduled for applications that are under review or shortlisted.');
    }

    const endsAt = new Date(startsAt.getTime() + INTERVIEW_MINUTES * 60000);
    // Scheduling again for the same application moves the existing interview instead of adding a second one.
    let interview = await Interview.findOne({ application: app._id, status: 'scheduled' });
    interview = interview || new Interview({ application: app._id, student: app.student, employer: req.user._id });
    interview.set({ startsAt, endsAt, format: data.format, details: data.details ?? '' });
    await interview.save();

    app.status = 'interview';
    app.events.push({ label: `Interview scheduled for ${formatWhen(startsAt)}` });
    await app.save();
    await notify(app.student, 'Interview scheduled', `${req.user.employer.company} scheduled your interview for ${app.opportunity.title}: ${formatWhen(startsAt)}.`);
    res.status(201).json({ interview: await interview.populate(populate) });
  }),
);

router.patch(
  '/:id',
  requireRole(ROLES.EMPLOYER),
  wrap(async (req, res) => {
    const { status } = parseBody(z.object({ status: z.enum(['completed', 'cancelled']) }), req.body);
    const interview = await Interview.findOne({ _id: req.params.id, employer: req.user._id });
    if (!interview) throw notFound('Interview not found.');
    if (interview.status !== 'scheduled') throw conflict('Only a scheduled interview can be changed.');
    if (status === 'completed' && interview.startsAt > new Date()) throw conflict('This interview has not taken place yet.');

    interview.status = status;
    await interview.save();

    const app = await Application.findById(interview.application);
    if (status === 'cancelled' && app.status === 'interview') {
      app.status = 'shortlisted';
      app.events.push({ label: 'Interview cancelled' });
      await app.save();
      await notify(app.student, 'Interview cancelled', `${req.user.employer.company} cancelled your interview.`);
    } else if (status === 'completed') {
      app.events.push({ label: 'Interview completed' });
      await app.save();
    }
    res.json({ interview: await interview.populate(populate) });
  }),
);

function formatWhen(d) {
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Jamaica' });
}

export default router;

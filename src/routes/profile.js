import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Application } from '../models/Application.js';
import { ROLES } from '../lib/constants.js';
import { AppError, forbidden, notFound, wrap } from '../lib/errors.js';
import { parseBody, validId } from '../middleware/validate.js';

const router = Router();
router.param('userId', validId);

router.get('/', (req, res) => res.json({ user: req.user }));

const emailField = z.string().trim().toLowerCase().email('Enter a valid email address.');
const phoneField = z.string().trim().max(30).optional();

const studentSchema = z.object({
  email: emailField,
  phone: phoneField,
  year: z.coerce.number().int().min(1).max(6),
  programme: z.string().trim().max(120).optional(),
  school: z.string().trim().max(160).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(30),
});

const employerSchema = z.object({
  name: z.string().trim().min(2, 'Enter the contact name.').max(100),
  email: emailField,
  phone: phoneField,
  company: z.string().trim().min(2, 'Enter the organisation name.').max(120),
  sector: z.string().trim().max(80).optional(),
  website: z.string().trim().max(120).optional(),
  address: z.string().trim().max(200).optional(),
  about: z.string().trim().max(1500).optional(),
  contactTitle: z.string().trim().max(80).optional(),
});

router.put(
  '/',
  wrap(async (req, res) => {
    const user = req.user;
    if (user.role === ROLES.ADMIN) throw forbidden('Administrator profiles are managed by the setup script.');

    const isStudent = user.role === ROLES.STUDENT;
    const data = parseBody(isStudent ? studentSchema : employerSchema, req.body);

    if (data.email !== user.email && (await User.exists({ email: data.email, _id: { $ne: user._id } }))) {
      throw new AppError(409, 'Please fix the highlighted fields.', { email: 'Another account already uses this email.' });
    }
    user.email = data.email;
    user.phone = data.phone ?? '';
    if (isStudent) {
      user.student.year = data.year;
      user.student.skills = [...new Set(data.skills)];
      if (data.programme !== undefined) user.student.programme = data.programme;
      if (data.school !== undefined) user.student.school = data.school;
    } else {
      user.name = data.name;
      Object.assign(user.employer, {
        company: data.company,
        sector: data.sector ?? '',
        website: data.website ?? '',
        address: data.address ?? '',
        about: data.about ?? '',
        contactTitle: data.contactTitle ?? '',
      });
    }
    await user.save();
    res.json({ user });
  }),
);

// Marks the welcome tour as finished (or skipped) so it is not shown again.
router.post(
  '/onboarding',
  wrap(async (req, res) => {
    req.user.onboarded = true;
    await req.user.save();
    res.json({ user: req.user });
  }),
);

// ---- CV upload (PDF, max 2 MB, sent as base64 JSON) ----
const MAX_CV_BYTES = 2 * 1024 * 1024;

router.put(
  '/cv',
  wrap(async (req, res) => {
    if (req.user.role !== ROLES.STUDENT) throw forbidden();
    const { name, data } = parseBody(
      z.object({ name: z.string().trim().min(1).max(120), data: z.string().min(1, 'Choose a PDF file.') }),
      req.body,
    );
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > MAX_CV_BYTES) throw new AppError(400, 'Your CV must be 2 MB or smaller.');
    if (bytes.subarray(0, 4).toString() !== '%PDF') throw new AppError(400, 'Your CV must be a PDF file.');

    const uploadedAt = new Date();
    req.user.cv = { name, size: bytes.length, data: bytes, uploadedAt };
    req.user.cvInfo = { name, size: bytes.length, uploadedAt };
    await req.user.save();
    res.json({ user: req.user });
  }),
);

router.get(
  '/cv/:userId',
  wrap(async (req, res) => {
    const me = req.user;
    const studentId = req.params.userId;
    let allowed = me.role === ROLES.ADMIN || String(me._id) === studentId;
    // An employer may only read the CV of a student who applied to one of their opportunities.
    if (!allowed && me.role === ROLES.EMPLOYER) {
      allowed = !!(await Application.exists({ student: studentId, employer: me._id }));
    }
    if (!allowed) throw forbidden();
    const student = await User.findById(studentId).select('+cv');
    if (!student?.cv?.data) throw notFound('No CV on file.');
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${student.cv.name.replace(/[^\w.\- ]/g, '_')}"`);
    res.send(student.cv.data);
  }),
);

export default router;

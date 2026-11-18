import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Application } from '../models/Application.js';
import bcrypt from 'bcryptjs';
import { Opportunity } from '../models/Opportunity.js';
import { Interview } from '../models/Interview.js';
import { Placement } from '../models/Placement.js';
import { Notification } from '../models/Notification.js';
import { photoStore } from '../lib/cloudinary.js';
import { clearAuthCookie } from '../lib/tokens.js';
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

    // The email belongs to the sign-in account, so the profile never changes it.
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

// ---- Profile photo (JPEG, PNG or WebP, max 2 MB, sent as base64 JSON, stored on Cloudinary) ----
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const imageKind = (b) =>
  b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'jpeg'
  : b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'png'
  : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'webp'
  : null;

router.put(
  '/photo',
  wrap(async (req, res) => {
    if (!photoStore.enabled()) throw new AppError(503, 'Photo uploads are not set up on this server yet.');
    const { data } = parseBody(z.object({ data: z.string().min(1, 'Choose an image.') }), req.body);
    const bytes = Buffer.from(data.replace(/^data:[^,]*,/, ''), 'base64');
    if (bytes.length > MAX_PHOTO_BYTES) throw new AppError(400, 'Your photo must be 2 MB or smaller.');
    if (!imageKind(bytes)) throw new AppError(400, 'Your photo must be a JPEG, PNG or WebP image.');

    let stored;
    try {
      stored = await photoStore.upload(bytes, String(req.user._id));
    } catch (err) {
      console.error('Photo upload failed:', err.message);
      throw new AppError(502, 'Could not save your photo. Please try again.');
    }
    req.user.avatar = stored;
    await req.user.save();
    res.json({ user: req.user });
  }),
);

router.delete(
  '/photo',
  wrap(async (req, res) => {
    const publicId = req.user.avatar?.publicId;
    if (publicId && photoStore.enabled()) await photoStore.remove(publicId).catch(() => {});
    req.user.avatar = undefined;
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

// Permanently deletes the signed-in account and everything that belongs to it. Needs the password.
const deleteAccount = wrap(async (req, res) => {
    const user = req.user;
    if (user.role === ROLES.ADMIN) throw forbidden('Administrator accounts are managed by the setup script.');
    const { password } = parseBody(z.object({ password: z.string().min(1, 'Enter your password to confirm.') }), req.body);
    const full = await User.findById(user._id).select('+passwordHash');
    if (!full?.passwordHash || !(await bcrypt.compare(password, full.passwordHash))) {
      throw new AppError(403, 'Incorrect password.');
    }

    const id = user._id;
    if (user.avatar?.publicId && photoStore.enabled()) await photoStore.remove(user.avatar.publicId).catch(() => {});
    const mine = user.role === ROLES.STUDENT ? { student: id } : { employer: id };
    await Promise.all([
      Application.deleteMany(mine),
      Interview.deleteMany(mine),
      Placement.deleteMany(mine),
      Notification.deleteMany({ user: id }),
      user.role === ROLES.EMPLOYER ? Opportunity.deleteMany({ employer: id }) : null,
    ]);
    await User.deleteOne({ _id: id });
    clearAuthCookie(res);
    res.json({ ok: true });
  });

// POST is the one the app uses (some proxies drop the body of a DELETE, which would lose the password).
router.post('/delete', deleteAccount);
router.delete('/', deleteAccount);

export default router;

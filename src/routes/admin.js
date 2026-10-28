import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Opportunity } from '../models/Opportunity.js';
import { Application } from '../models/Application.js';
import { Placement } from '../models/Placement.js';
import { Notification } from '../models/Notification.js';
import { ROLES, APP_STATUS, PLACEMENT_STATUS } from '../lib/constants.js';
import { forbidden, notFound, wrap } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { parseBody, validId } from '../middleware/validate.js';
import { notify } from '../lib/notify.js';

const router = Router();
router.use(requireRole(ROLES.ADMIN));
router.param('id', validId);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get(
  '/overview',
  wrap(async (req, res) => {
    const [pendingOpportunities, pendingEmployers, pendingPlacements, byStatus, activity, students, employers, openOpportunities, applications, placedStudents] = await Promise.all([
      Opportunity.countDocuments({ status: 'pending_approval' }),
      User.countDocuments({ role: ROLES.EMPLOYER, status: 'unverified' }),
      Placement.countDocuments({ status: 'p_pending' }),
      Placement.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(5),
      User.countDocuments({ role: ROLES.STUDENT }),
      User.countDocuments({ role: ROLES.EMPLOYER }),
      Opportunity.countDocuments({ status: 'open' }),
      Application.countDocuments(),
      Placement.distinct('student', { status: { $in: PLACED } }),
    ]);
    const placementsByStatus = toCounts(byStatus, PLACEMENT_STATUS);
    const totals = {
      students,
      studentsPlaced: placedStudents.length,
      employers,
      openOpportunities,
      applications,
      placements: Object.values(placementsByStatus).reduce((a, b) => a + b, 0),
    };
    res.json({ pendingOpportunities, pendingEmployers, pendingPlacements, placementsByStatus, totals, activity });
  }),
);

// ---------- accounts ----------
router.get(
  '/students',
  wrap(async (req, res) => {
    const filter = { role: ROLES.STUDENT };
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(String(req.query.q).trim()), 'i');
      filter.$or = [{ name: rx }, { 'student.studentId': rx }, { email: rx }];
    }
    const students = await User.find(filter).sort({ name: 1 });
    const ids = students.map((s) => s._id);
    const [appCounts, placements] = await Promise.all([
      Application.aggregate([{ $match: { student: { $in: ids } } }, { $group: { _id: '$student', n: { $sum: 1 } } }]),
      Placement.find({ student: { $in: ids } }).sort({ createdAt: 1 }).select('student status'),
    ]);
    const apps = new Map(appCounts.map((a) => [String(a._id), a.n]));
    const latest = new Map(placements.map((p) => [String(p.student), p.status])); // later placements overwrite earlier ones
    res.json({
      students: students.map((s) => ({ ...s.toJSON(), applicationCount: apps.get(String(s._id)) || 0, placementStatus: latest.get(String(s._id)) || 'none' })),
    });
  }),
);

router.get(
  '/employers',
  wrap(async (_req, res) => {
    const employers = await User.find({ role: ROLES.EMPLOYER }).sort({ createdAt: -1 });
    const counts = await Opportunity.aggregate([{ $match: { status: { $ne: 'draft' } } }, { $group: { _id: '$employer', n: { $sum: 1 } } }]);
    const map = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({ employers: employers.map((e) => ({ ...e.toJSON(), opportunityCount: map.get(String(e._id)) || 0 })) });
  }),
);

// Verify an employer, suspend an account, or reactivate it.
router.patch(
  '/users/:id/status',
  wrap(async (req, res) => {
    const { status } = parseBody(z.object({ status: z.enum(['active', 'suspended']) }), req.body);
    const user = await User.findById(req.params.id);
    if (!user) throw notFound('User not found.');
    if (user.role === ROLES.ADMIN) throw forbidden('Administrator accounts cannot be changed here.');
    user.status = status;
    await user.save();
    if (status === 'active' && user.role === ROLES.EMPLOYER) {
      await notify(user._id, 'Organisation verified', 'You can now publish opportunities.');
    }
    res.json({ user });
  }),
);

// ---------- reports ----------
const PLACED = ['p_confirmed', 'p_active', 'p_completed'];

router.get(
  '/reports',
  wrap(async (_req, res) => {
    const [students, placed, appStatus, plStatus] = await Promise.all([
      User.aggregate([{ $match: { role: ROLES.STUDENT } }, { $group: { _id: '$student.programme', total: { $sum: 1 } } }]),
      Placement.aggregate([
        { $match: { status: { $in: PLACED } } },
        { $group: { _id: '$student' } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        { $group: { _id: '$u.student.programme', placed: { $sum: 1 } } },
      ]),
      Application.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Placement.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const placedBy = new Map(placed.map((p) => [p._id, p.placed]));
    const programmes = students
      .map((s) => ({ programme: s._id || 'Not set', total: s.total, placed: placedBy.get(s._id) || 0 }))
      .sort((a, b) => b.total - a.total);
    res.json({
      programmes,
      applicationsByStatus: toCounts(appStatus, APP_STATUS),
      placementsByStatus: toCounts(plStatus, PLACEMENT_STATUS),
    });
  }),
);

router.get(
  '/export/:type',
  wrap(async (req, res) => {
    const exporters = { students: exportStudents, applications: exportApplications, placements: exportPlacements };
    const run = exporters[req.params.type];
    if (!run) throw notFound();
    const rows = await run();
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="placeme-${req.params.type}.csv"`);
    res.send(toCsv(rows));
  }),
);

async function exportStudents() {
  const students = await User.find({ role: ROLES.STUDENT }).sort({ name: 1 });
  return [['Name', 'Email', 'Student ID', 'Programme', 'Year', 'Account status'], ...students.map((s) => [s.name, s.email, s.student.studentId, s.student.programme, s.student.year, s.status])];
}
async function exportApplications() {
  const apps = await Application.find().sort({ appliedAt: -1 }).populate('student', 'name').populate('opportunity', 'title').populate('employer', 'employer.company');
  return [['Application', 'Student', 'Opportunity', 'Employer', 'Applied', 'Status'], ...apps.map((a) => [a.code, a.student.name, a.opportunity.title, a.employer.employer.company, a.appliedAt.toISOString().slice(0, 10), a.status])];
}
async function exportPlacements() {
  const pls = await Placement.find().sort({ createdAt: -1 }).populate('student', 'name').populate('employer', 'employer.company').populate('opportunity', 'title');
  const day = (d) => (d ? d.toISOString().slice(0, 10) : '');
  return [['Placement', 'Student', 'Employer', 'Role', 'Start', 'End', 'Status'], ...pls.map((p) => [p.code, p.student.name, p.employer.employer.company, p.opportunity.title, day(p.startDate), day(p.endDate), p.status])];
}

// CSV with quoting; cells that start with = + - @ are prefixed so spreadsheets do not run them as formulas.
function toCsv(rows) {
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

function toCounts(agg, keys) {
  const map = Object.fromEntries(agg.map((a) => [a._id, a.n]));
  return Object.fromEntries(keys.map((k) => [k, map[k] || 0]));
}

export default router;

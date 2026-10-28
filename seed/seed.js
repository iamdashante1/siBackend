// Usage:
//   npm run seed:admin   -> creates (or updates the password of) the administrator only
//   npm run seed         -> administrator + demo data (safe to re-run: skips if demo data already exists)
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { User } from '../src/models/User.js';
import { Opportunity } from '../src/models/Opportunity.js';
import { Application } from '../src/models/Application.js';
import { Interview } from '../src/models/Interview.js';
import { Placement } from '../src/models/Placement.js';
import { Notification } from '../src/models/Notification.js';
import { nextCode } from '../src/models/Counter.js';
import { computeEndDate } from '../src/lib/dates.js';

const adminOnly = process.argv.includes('--admin-only');
const DEMO_PASSWORD = 'Demo1234'; // demo accounts only; never used for the administrator

await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });

// ---------- administrator ----------
const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || '';
if (!adminEmail || adminPassword.length < 8) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters) in backend/.env first.');
  process.exit(1);
}
const adminHash = await bcrypt.hash(adminPassword, 10);
await User.findOneAndUpdate(
  { email: adminEmail },
  { $set: { passwordHash: adminHash, role: 'ADMIN', status: 'active' }, $setOnInsert: { name: 'Placement Office' } },
  { upsert: true },
);
console.log(`Administrator ready: ${adminEmail}`);

if (adminOnly) {
  await mongoose.disconnect();
  process.exit(0);
}

// ---------- demo data ----------
if (await User.exists({ email: 'a.williams@haldensystems.com.jm' })) {
  console.log('Demo data already exists, nothing to add.');
  await mongoose.disconnect();
  process.exit(0);
}

const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
const day = 86400000;
const inDays = (n) => new Date(Date.now() + n * day);
const ymd = (d) => new Date(`${d.toISOString().slice(0, 10)}T12:00:00Z`);

const employerDefs = [
  ['halden', 'Andre Williams', 'a.williams@haldensystems.com.jm', 'Halden Systems', 'Software', 'Kingston', 'active', 'Talent Lead'],
  ['kestrel', 'Ruth Adams', 'r.adams@kestrel.com.jm', 'Kestrel Analytics', 'Data and analytics', 'Kingston', 'active', 'Analytics Manager'],
  ['meridian', 'Dr Sandra Whyte', 's.whyte@meridianhealth.org.jm', 'Meridian Health', 'Healthcare', 'Montego Bay', 'active', 'Head of Clinical Systems'],
  ['corvane', 'Ian Ramsay', 'i.ramsay@corvane.com', 'Corvane Logistics', 'Logistics', 'Portmore', 'active', 'Operations Lead'],
  ['brightwater', 'Joanne Palmer', 'j.palmer@brightwater.energy', 'Brightwater Energy', 'Energy', 'Mandeville', 'active', 'HR Partner'],
  ['fenwick', 'Marlon Ross', 'm.ross@fenwickross.com', 'Fenwick & Ross', 'Financial services', 'Kingston', 'active', 'Graduate Programme Lead'],
  ['ashgrove', 'Mia Thompson', 'mia@ashgrove.studio', 'Ashgrove Studio', 'Design', 'Kingston', 'unverified', ''],
  ['riocobre', 'Courtney Hart', 'c.hart@riocobrewater.com.jm', 'Rio Cobre Water', 'Utilities', 'Spanish Town', 'unverified', ''],
];
const emp = {};
for (const [key, name, email, company, sector, city, status, contactTitle] of employerDefs) {
  emp[key] = await User.create({
    name, email, passwordHash: hash, role: 'EMPLOYER', status,
    employer: { company, sector, city, contactTitle, website: `${company.toLowerCase().replace(/[^a-z]/g, '')}.com.jm`, about: `${company} hosts UTech interns and graduates.` },
  });
}

const studentDefs = [
  ['sc', 'Shanice Campbell', 's.campbell@students.utech.edu.jm', '2104417', 'BSc Computing', 3, ['JavaScript', 'TypeScript', 'React', 'Node.js', 'SQL', 'Git']],
  ['jc', 'Jordan Chin', 'j.chin@students.utech.edu.jm', '2103982', 'BEng Software Engineering', 3, ['Java', 'Python', 'SQL', 'Git']],
  ['kr', 'Kezia Reid', 'k.reid@students.utech.edu.jm', '2205120', 'BSc Computing', 2, ['Java', 'Python']],
  ['rt', 'Rohan Thompson', 'r.thompson@students.utech.edu.jm', '2104790', 'BSc Information Systems', 3, ['SQL', 'Excel']],
  ['th', 'Tia Henry', 't.henry@students.utech.edu.jm', '2104021', 'BSc Computing', 3, ['Python', 'Git']],
  ['dm', 'Dwayne Morrison', 'd.morrison@students.utech.edu.jm', '2002234', 'MEng Computing', 4, ['Go', 'Docker', 'SQL']],
  ['ag', 'Ashley Grant', 'a.grant@students.utech.edu.jm', '2103655', 'BSc Mathematics and CS', 3, ['R', 'Python']],
  ['kl', 'Kemar Lewis', 'k.lewis@students.utech.edu.jm', '2205388', 'BSc Computing', 2, ['HTML', 'CSS']],
  ['gs', 'Gabrielle Spence', 'g.spence@students.utech.edu.jm', '2001977', 'BSc Business Management', 4, ['Excel', 'Communication']],
  ['ml', 'Marcus Lee', 'm.lee@students.utech.edu.jm', '2104555', 'BSc Web Development', 3, ['React', 'CSS']],
  ['nf', 'Nadine Francis', 'n.francis@students.utech.edu.jm', '2104310', 'BSc Computing', 3, ['TypeScript', 'React']],
  ['jb', 'Jordan Blake', 'j.blake@students.utech.edu.jm', '2002901', 'BEng Mechanical Engineering', 4, ['CAD']],
  ['cp', 'Chloe Powell', 'c.powell@students.utech.edu.jm', '2001640', 'BSc Computing', 4, ['Python', 'Statistics']],
  ['bh', 'Brandon Harris', 'b.harris@students.utech.edu.jm', '2001702', 'BSc Computing', 4, ['Java']],
  ['ob', 'Omar Bailey', 'o.bailey@students.utech.edu.jm', '2104402', 'BEng Mechanical Engineering', 3, []],
];
const stu = {};
for (const [key, name, email, studentId, programme, year, skills] of studentDefs) {
  stu[key] = await User.create({
    name, email, passwordHash: hash, role: 'STUDENT', status: key === 'ob' ? 'suspended' : 'active', phone: '(876) 555-0418',
    student: { studentId, programme, year, school: 'School of Computing and Information Technology', skills },
  });
}

const fields = {
  Computing: { about: 'You will join a product team building web applications used by customers and colleagues, working on real tickets alongside experienced engineers.', resp: ['Build and test features in an established TypeScript and React codebase', 'Take part in code review, stand-ups and sprint planning', 'Document the features you deliver for other developers'], req: ['Studying Computer Science, Software Engineering or a related degree', 'Working knowledge of at least one programming language', 'Familiarity with Git and version control'] },
  Data: { about: 'You will support the analytics team in preparing, analysing and presenting data for client projects in retail and transport.', resp: ['Clean and prepare datasets using SQL and Python', 'Build dashboards and summary reports for project teams', 'Present findings to analysts and account managers'], req: ['Studying Data Science, Mathematics, Computer Science or similar', 'Experience with SQL and a scripting language', 'Clear written communication'] },
  Health: { about: 'You will work with the clinical systems team that supports patient record and scheduling software across Meridian Health sites.', resp: ['Gather requirements from clinical and administrative staff', 'Test system changes and record defects', 'Prepare user guides and training material'], req: ['Studying Computing, Information Systems or Health Informatics', 'Interest in healthcare technology', 'A careful, methodical approach to testing'] },
  Logistics: { about: 'You will join the operations planning team and help improve how goods move between Corvane warehouses across the Corporate Area.', resp: ['Analyse delivery and warehouse performance data', 'Support route and inventory planning', 'Prepare weekly reports for operations managers'], req: ['Studying Business, Logistics, Engineering or a related subject', 'Confident with spreadsheets', 'Comfortable working on site'] },
  Engineering: { about: 'You will support project engineers on onshore wind and solar sites in Manchester and St Elizabeth, from design reviews to site visits.', resp: ['Assist with technical drawings and design reviews', 'Join site visits and record inspection findings', 'Help prepare project documentation'], req: ['Studying Mechanical, Electrical or Civil Engineering', 'Familiarity with CAD software'] },
  Finance: { about: 'You will work in the finance operations team supporting payments, reconciliations and month-end reporting.', resp: ['Process and reconcile client transactions', 'Support month-end close and reporting', 'Help improve team processes and checklists'], req: ['Studying Accounting, Finance, Economics or a related degree', 'Strong attention to detail', 'Confident with Excel'] },
  Business: { about: 'You will support the marketing team with campaigns aimed at business customers.', resp: ['Draft content for email and social channels', 'Track campaign results', 'Coordinate with external agencies'], req: ['Studying Marketing, Business or Communications', 'Strong writing skills', 'Organised and reliable'] },
};

// [key, employer, title, type, field, location, mode, duration, startsInDays, positions, pay, deadlineInDays, status]
const oppDefs = [
  ['brightwater1', 'brightwater', 'Renewable Energy Engineering Intern', 'Internship', 'Engineering', 'Mandeville', 'On-site', '6 months', 120, 2, 'J$115,000 per month', 5, 'open'],
  ['fenwick1', 'fenwick', 'Finance Operations Intern', 'Internship', 'Finance', 'Kingston', 'Hybrid', '10 weeks', 250, 2, 'J$135,000 per month', 12, 'open'],
  ['kestrel1', 'kestrel', 'Data Analyst Intern', 'Internship', 'Data', 'New Kingston', 'On-site', '10 weeks', 240, 2, 'J$110,000 per month', 25, 'open'],
  ['halden1', 'halden', 'Software Engineering Intern', 'Internship', 'Computing', 'Kingston', 'Hybrid', '12 weeks', 230, 3, 'J$120,000 per month', 32, 'open'],
  ['corvane1', 'corvane', 'Supply Chain Intern', 'Internship', 'Logistics', 'Portmore', 'On-site', '12 weeks', 235, 4, 'J$100,000 per month', 39, 'open'],
  ['halden2', 'halden', 'Junior Frontend Developer', 'Graduate job', 'Computing', 'Remote (Jamaica)', 'Remote', 'Permanent', 330, 1, 'J$3,400,000 per year', 46, 'open'],
  ['meridian1', 'meridian', 'Graduate Clinical Systems Analyst', 'Graduate job', 'Health', 'Montego Bay', 'Hybrid', 'Permanent', 330, 2, 'J$3,100,000 per year', 48, 'open'],
  ['halden3', 'halden', 'DevOps Intern', 'Internship', 'Computing', 'Kingston', 'Hybrid', '12 weeks', 230, 1, 'J$120,000 per month', 60, 'pending_approval'],
  ['corvane2', 'corvane', 'Marketing Assistant Intern', 'Internship', 'Business', 'Portmore', 'Hybrid', '10 weeks', 240, 1, 'J$95,000 per month', 53, 'pending_approval'],
  ['meridian2', 'meridian', 'Laboratory Technician Intern', 'Internship', 'Health', 'Montego Bay', 'On-site', '12 weeks', 235, 2, 'J$100,000 per month', 57, 'pending_approval'],
  ['halden4', 'halden', 'QA Automation Intern', 'Internship', 'Computing', 'Kingston', 'Hybrid', '12 weeks', 230, 1, 'J$120,000 per month', null, 'draft'],
  ['halden5', 'halden', 'Summer Software Intern 2026', 'Internship', 'Computing', 'Kingston', 'Hybrid', '12 weeks', -130, 4, 'J$115,000 per month', -210, 'closed'],
  ['meridian3', 'meridian', 'Clinical Systems Intern', 'Internship', 'Health', 'Montego Bay', 'On-site', '12 weeks', 90, 1, 'J$105,000 per month', -20, 'closed'],
  ['fenwick2', 'fenwick', 'Client Services Intern', 'Internship', 'Finance', 'Kingston', 'On-site', '6 months', -40, 1, 'J$120,000 per month', -90, 'closed'],
  ['brightwater2', 'brightwater', 'Site Engineering Intern', 'Internship', 'Engineering', 'Mandeville', 'On-site', '3 months', -35, 1, 'J$110,000 per month', -90, 'closed'],
  ['kestrel2', 'kestrel', 'Data Science Intern', 'Internship', 'Data', 'New Kingston', 'On-site', '12 weeks', -130, 1, 'J$110,000 per month', -200, 'closed'],
];
const opp = {};
for (const [key, e, title, type, field, location, workMode, duration, start, positions, pay, deadline, status] of oppDefs) {
  const f = fields[field];
  opp[key] = await Opportunity.create({
    code: await nextCode('OP'), employer: emp[e]._id, title, type, field, location, workMode, duration, positions, pay, status,
    startDate: ymd(inDays(start)), deadline: deadline == null ? undefined : inDays(deadline),
    about: f.about, responsibilities: f.resp, requirements: f.req,
  });
}

// Creates an application whose timeline follows the given status path.
async function apply(stuKey, oppKey, status, daysAgo, path = []) {
  const o = opp[oppKey];
  const company = emp[oppDefs.find((d) => d[0] === oppKey)[1]].employer.company;
  const labels = { review: `Under review by ${company}`, shortlisted: 'Shortlisted', interview: 'Interview completed', offered: 'Offer made', accepted: 'Offer accepted', rejected: 'Not selected' };
  const events = [{ label: 'Application submitted', at: inDays(-daysAgo) }];
  path.forEach((s, i) => events.push({ label: labels[s] || s, at: inDays(-daysAgo + (i + 1) * 2) }));
  return Application.create({
    code: await nextCode('APP'), student: stu[stuKey]._id, opportunity: o._id, employer: o.employer, status, appliedAt: inDays(-daysAgo), events,
    coverLetter: `I'm applying for the ${o.title} role. As a ${studentDefs.find((s) => s[0] === stuKey)[4]} student I have completed relevant modules and projects, and I am available for the full duration.`,
  });
}

const at = (days, hour, min = 0) => { const d = inDays(days); d.setUTCHours(hour + 5, min, 0, 0); return d; }; // Jamaica is UTC-5
async function interview(app, stuKey, empKey, when, status = 'scheduled', format = 'Video call') {
  return Interview.create({ application: app._id, student: stu[stuKey]._id, employer: emp[empKey]._id, startsAt: when, endsAt: new Date(+when + 45 * 60000), format, status });
}
async function placement(app, stuKey, oppKey, status, history) {
  const o = opp[oppKey];
  return Placement.create({
    code: await nextCode('PL'), student: stu[stuKey]._id, employer: o.employer, opportunity: o._id, application: app._id, status,
    startDate: o.startDate, endDate: computeEndDate(o.startDate, o.duration), supervisor: { name: emp[oppDefs.find((d) => d[0] === oppKey)[1]].name, email: emp[oppDefs.find((d) => d[0] === oppKey)[1]].email },
    history: history.map((s, i) => ({ status: s, at: inDays(-20 + i * 5) })),
  });
}

// Shanice: one application in each state
await apply('sc', 'halden2', 'submitted', 2);
await apply('sc', 'kestrel1', 'review', 7, ['review']);
const scInt = await apply('sc', 'halden1', 'interview', 11, ['review', 'shortlisted']);
scInt.events.push({ label: 'Interview scheduled', at: inDays(-3) });
await scInt.save();
await interview(scInt, 'sc', 'halden', at(8, 10, 30));
await apply('sc', 'fenwick1', 'rejected', 25, ['review', 'rejected']);
const scAcc = await apply('sc', 'meridian3', 'accepted', 40, ['shortlisted', 'interview', 'offered', 'accepted']);
await placement(scAcc, 'sc', 'meridian3', 'p_confirmed', ['p_pending', 'p_confirmed']);

// Halden's candidates for the Software Engineering Intern role
const jc = await apply('jc', 'halden1', 'interview', 12, ['review', 'shortlisted']);
await interview(jc, 'jc', 'halden', at(9, 14), 'scheduled', 'On-site');
await apply('kr', 'halden1', 'shortlisted', 10, ['review', 'shortlisted']);
await apply('rt', 'halden1', 'review', 9, ['review']);
await apply('th', 'halden1', 'submitted', 8);
const dm = await apply('dm', 'halden1', 'accepted', 14, ['shortlisted', 'interview', 'offered', 'accepted']);
await interview(dm, 'dm', 'halden', at(-4, 11), 'completed');
await placement(dm, 'dm', 'halden1', 'p_pending', ['p_pending']);
await apply('ag', 'halden1', 'rejected', 15, ['review', 'rejected']);
await apply('kl', 'halden1', 'submitted', 7);
await apply('ml', 'halden2', 'review', 4, ['review']);
await apply('nf', 'halden2', 'shortlisted', 6, ['review', 'shortlisted']);

// Historic placements so reports have something to show
const gs = await apply('gs', 'fenwick2', 'accepted', 70, ['shortlisted', 'offered', 'accepted']);
await placement(gs, 'gs', 'fenwick2', 'p_active', ['p_pending', 'p_confirmed', 'p_active']);
const jb = await apply('jb', 'brightwater2', 'accepted', 65, ['shortlisted', 'offered', 'accepted']);
await placement(jb, 'jb', 'brightwater2', 'p_active', ['p_pending', 'p_confirmed', 'p_active']);
const cp = await apply('cp', 'kestrel2', 'accepted', 180, ['shortlisted', 'offered', 'accepted']);
await placement(cp, 'cp', 'kestrel2', 'p_completed', ['p_pending', 'p_confirmed', 'p_active', 'p_completed']);
const bh = await apply('bh', 'halden5', 'accepted', 190, ['shortlisted', 'offered', 'accepted']);
await placement(bh, 'bh', 'halden5', 'p_completed', ['p_pending', 'p_confirmed', 'p_active', 'p_completed']);

// A few notifications so the bell is not empty
const admin = await User.findOne({ email: adminEmail });
await Notification.insertMany([
  { user: admin._id, title: 'Employer registered', body: 'Ashgrove Studio registered and needs verification.' },
  { user: admin._id, title: 'Opportunity submitted', body: 'Halden Systems submitted DevOps Intern for approval.' },
  { user: admin._id, title: 'Offer accepted', body: 'Dwayne Morrison accepted an offer from Halden Systems.' },
  { user: stu.sc._id, title: 'Interview scheduled', body: 'Halden Systems scheduled your interview.' },
  { user: stu.sc._id, title: 'Placement confirmed', body: 'The placement office confirmed your placement at Meridian Health.' },
  { user: emp.halden._id, title: 'New application', body: 'Shanice Campbell applied for Junior Frontend Developer.' },
  { user: emp.halden._id, title: 'Awaiting approval', body: 'DevOps Intern is with the placement office for review.' },
]);

console.log(`Demo data created. Demo logins (password ${DEMO_PASSWORD}):`);
console.log('  student   s.campbell@students.utech.edu.jm');
console.log('  employer  a.williams@haldensystems.com.jm');
console.log(`  admin     ${adminEmail} (the password from your .env)`);
await mongoose.disconnect();

// Usage: npm run seed:opps
// Adds verified demo employers and a set of open opportunities for students to browse.
// Nothing else is created or changed, and it is safe to re-run (employers and titles that exist are skipped).
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { User } from '../src/models/User.js';
import { Opportunity } from '../src/models/Opportunity.js';
import { nextCode } from '../src/models/Counter.js';

const DEMO_PASSWORD = 'Demo1234';
const day = 86400000;
const inDays = (n) => new Date(Date.now() + n * day);
const ymd = (d) => new Date(`${d.toISOString().slice(0, 10)}T12:00:00Z`);

await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

// [email, contact, title, company, sector, city]
const employers = {
  northstar: ['hr@northstarsoftware.demo', 'Andre Campbell', 'Talent Lead', 'Northstar Software', 'Software', 'Kingston'],
  blueharbour: ['careers@blueharbourbank.demo', 'Tanya Reid', 'Early Careers Manager', 'Blue Harbour Bank', 'Financial services', 'Kingston'],
  greenfield: ['people@greenfieldenergy.demo', 'Marcus Gayle', 'HR Business Partner', 'Greenfield Energy', 'Energy', 'Mandeville'],
  caribmed: ['recruit@caribmedical.demo', 'Simone Brown', 'Programme Coordinator', 'Carib Medical Group', 'Healthcare', 'Montego Bay'],
  islandlogistics: ['jobs@islandlogistics.demo', 'Kerry-Ann Lewis', 'Operations HR', 'Island Logistics', 'Logistics', 'Portmore'],
  pulsemedia: ['hello@pulsemedia.demo', 'Jordan Francis', 'Studio Manager', 'Pulse Media', 'Marketing', 'Kingston'],
};

const text = {
  Computing: {
    about: 'Join an engineering team building software used by customers across the Caribbean. You will pair with mentors and ship real work from your first month.',
    resp: ['Build and test features in a shared codebase', 'Review code with your mentor', 'Join daily stand-ups and sprint demos'],
    req: ['Studying Computer Science, IT or a related subject', 'Comfortable with at least one programming language', 'Curious and keen to learn'],
  },
  Data: {
    about: 'Work with the analytics team to turn raw data into insight that helps the business decide what to do next.',
    resp: ['Clean and explore datasets', 'Build dashboards and weekly reports', 'Present findings to non-technical colleagues'],
    req: ['Studying Statistics, Computing, Economics or similar', 'Familiar with SQL or Python', 'Clear communicator'],
  },
  Finance: {
    about: 'Support the finance team with day-to-day operations, reconciliations and reporting, with training along the way.',
    resp: ['Reconcile accounts and process transactions', 'Help prepare month-end reports', 'Improve checklists and team processes'],
    req: ['Studying Accounting, Finance or Economics', 'Strong attention to detail', 'Confident with Excel'],
  },
  Engineering: {
    about: 'Support project engineers on site and in the office, from design reviews to inspections.',
    resp: ['Assist with drawings and design reviews', 'Join site visits and record findings', 'Help prepare project documentation'],
    req: ['Studying Mechanical, Electrical or Civil Engineering', 'Familiar with CAD software', 'Comfortable working on site'],
  },
  Health: {
    about: 'Gain hands-on experience in a busy healthcare setting, working alongside clinical and administrative teams.',
    resp: ['Support clinical systems and records', 'Assist with data entry and quality checks', 'Help teams adopt new tools'],
    req: ['Studying Health Sciences, IT or Biology', 'Respect for patient confidentiality', 'Reliable and organised'],
  },
  Logistics: {
    about: 'Help the operations team move goods more efficiently across warehouses and delivery routes.',
    resp: ['Analyse delivery and inventory data', 'Support route planning', 'Prepare weekly operations reports'],
    req: ['Studying Business, Logistics or Engineering', 'Confident with spreadsheets', 'Comfortable on site'],
  },
  Business: {
    about: 'Support the marketing team on campaigns, content and reporting for business customers.',
    resp: ['Draft content for email and social channels', 'Track campaign results', 'Coordinate with external partners'],
    req: ['Studying Marketing, Business or Communications', 'Strong writing skills', 'Organised and reliable'],
  },
};

// [employer, title, type, field, location, mode, duration, startsInDays, positions, pay, deadlineInDays]
const opps = [
  ['northstar', 'Software Engineering Intern', 'Internship', 'Computing', 'Kingston', 'Hybrid', '12 weeks', 60, 3, 'J$120,000 per month', 21],
  ['northstar', 'Junior Backend Developer', 'Graduate job', 'Computing', 'Kingston', 'Hybrid', 'Permanent', 120, 2, 'J$3,600,000 per year', 40],
  ['northstar', 'Mobile App Developer Intern', 'Internship', 'Computing', 'Remote (Jamaica)', 'Remote', '12 weeks', 70, 2, 'J$115,000 per month', 28],
  ['northstar', 'UX Design Intern', 'Internship', 'Computing', 'Kingston', 'Hybrid', '10 weeks', 65, 1, 'J$105,000 per month', 18],
  ['blueharbour', 'Data Analyst Intern', 'Internship', 'Data', 'New Kingston', 'On-site', '10 weeks', 55, 2, 'J$110,000 per month', 14],
  ['blueharbour', 'Finance Operations Intern', 'Internship', 'Finance', 'Kingston', 'Hybrid', '10 weeks', 55, 3, 'J$130,000 per month', 20],
  ['blueharbour', 'Graduate Credit Analyst', 'Graduate job', 'Finance', 'Kingston', 'On-site', 'Permanent', 150, 2, 'J$3,300,000 per year', 45],
  ['blueharbour', 'Risk and Compliance Intern', 'Internship', 'Finance', 'Kingston', 'Hybrid', '12 weeks', 60, 1, 'J$125,000 per month', 30],
  ['greenfield', 'Renewable Energy Engineering Intern', 'Internship', 'Engineering', 'Mandeville', 'On-site', '6 months', 90, 2, 'J$115,000 per month', 25],
  ['greenfield', 'Graduate Electrical Engineer', 'Graduate job', 'Engineering', 'Mandeville', 'On-site', 'Permanent', 140, 1, 'J$3,500,000 per year', 50],
  ['greenfield', 'Energy Data Intern', 'Internship', 'Data', 'Remote (Jamaica)', 'Remote', '12 weeks', 75, 1, 'J$105,000 per month', 35],
  ['caribmed', 'Clinical Systems Intern', 'Internship', 'Health', 'Montego Bay', 'On-site', '12 weeks', 80, 2, 'J$100,000 per month', 22],
  ['caribmed', 'Graduate Health Informatics Analyst', 'Graduate job', 'Health', 'Montego Bay', 'Hybrid', 'Permanent', 150, 2, 'J$3,100,000 per year', 48],
  ['islandlogistics', 'Supply Chain Intern', 'Internship', 'Logistics', 'Portmore', 'On-site', '12 weeks', 60, 4, 'J$100,000 per month', 16],
  ['islandlogistics', 'Warehouse Systems Analyst', 'Graduate job', 'Logistics', 'Portmore', 'Hybrid', 'Permanent', 130, 1, 'J$3,000,000 per year', 42],
  ['pulsemedia', 'Marketing Assistant Intern', 'Internship', 'Business', 'Kingston', 'Hybrid', '10 weeks', 55, 2, 'J$95,000 per month', 19],
  ['pulsemedia', 'Social Media and Content Intern', 'Internship', 'Business', 'Remote (Jamaica)', 'Remote', '10 weeks', 55, 2, 'J$90,000 per month', 26],
];

const emp = {};
for (const [key, [email, name, contactTitle, company, sector, city]] of Object.entries(employers)) {
  emp[key] =
    (await User.findOne({ email })) ||
    (await User.create({
      name, email, passwordHash: hash, role: 'EMPLOYER', status: 'active', onboarded: true,
      employer: { company, sector, city, contactTitle, website: `${company.toLowerCase().replace(/[^a-z]/g, '')}.demo`, about: `${company} hosts UTech interns and graduates.` },
    }));
}

let added = 0;
for (const [e, title, type, field, location, workMode, duration, start, positions, pay, deadline] of opps) {
  if (await Opportunity.exists({ employer: emp[e]._id, title })) continue;
  const t = text[field];
  await Opportunity.create({
    code: await nextCode('OP'), employer: emp[e]._id, title, type, field, location, workMode, duration, positions, pay,
    status: 'open', startDate: ymd(inDays(start)), deadline: inDays(deadline),
    about: t.about, responsibilities: t.resp, requirements: t.req,
  });
  added++;
}
console.log(`Added ${added} open opportunities from ${Object.keys(employers).length} demo employers.`);
console.log(`Demo employer logins use password ${DEMO_PASSWORD}, e.g. ${employers.northstar[0]}`);
await mongoose.disconnect();

// Usage: npm run seed:careers
// Adds verified demo employers and many open opportunities across every career path.
// Safe to re-run: employers and (employer, title) pairs that already exist are skipped.
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

const CITIES = ['Kingston', 'New Kingston', 'Montego Bay', 'Mandeville', 'Portmore', 'Spanish Town', 'Ocho Rios', 'Remote (Jamaica)'];
const MODES = ['On-site', 'Hybrid', 'Remote'];

// Each career path: its employers, the shared description text, and the roles on offer.
// roles: [title, type]  (Internship or Graduate job)
const careers = [
  {
    field: 'Computing', sector: 'Software',
    employers: [['Bytewave Labs', 'Kingston'], ['Cobalt Cloud Jamaica', 'New Kingston'], ['Reef Digital', 'Montego Bay']],
    about: 'Join an engineering team building software used by customers across the Caribbean. You will pair with mentors and ship real work from your first month.',
    resp: ['Build and test features in a shared codebase', 'Review code with your mentor', 'Join daily stand-ups and sprint demos'],
    req: ['Studying Computer Science, IT or a related subject', 'Comfortable with at least one programming language', 'Curious and keen to learn'],
    roles: [
      ['Frontend Developer Intern', 'Internship'], ['Backend Developer Intern', 'Internship'], ['Full-Stack Developer Intern', 'Internship'],
      ['Mobile App Developer Intern', 'Internship'], ['QA and Test Automation Intern', 'Internship'], ['DevOps Engineer Intern', 'Internship'],
      ['Cybersecurity Analyst Intern', 'Internship'], ['Cloud Support Intern', 'Internship'], ['IT Support Technician Intern', 'Internship'],
      ['Junior Software Engineer', 'Graduate job'], ['Graduate Cloud Engineer', 'Graduate job'], ['Graduate Security Analyst', 'Graduate job'],
    ],
  },
  {
    field: 'Data', sector: 'Data and analytics',
    employers: [['Insightful Analytics', 'New Kingston'], ['Quantis Data Group', 'Kingston']],
    about: 'Work with the analytics team to turn raw data into insight that helps the business decide what to do next.',
    resp: ['Clean and explore datasets', 'Build dashboards and weekly reports', 'Present findings to non-technical colleagues'],
    req: ['Studying Statistics, Computing, Economics or similar', 'Familiar with SQL or Python', 'Clear communicator'],
    roles: [
      ['Data Analyst Intern', 'Internship'], ['Business Intelligence Intern', 'Internship'], ['Machine Learning Intern', 'Internship'],
      ['Data Engineering Intern', 'Internship'], ['Research Analyst Intern', 'Internship'], ['Graduate Data Analyst', 'Graduate job'],
      ['Graduate Data Engineer', 'Graduate job'], ['Junior Data Scientist', 'Graduate job'],
    ],
  },
  {
    field: 'Engineering', sector: 'Energy',
    employers: [['SolarCrest Energy', 'Mandeville'], ['Blue Mountain Engineering', 'Kingston'], ['Caribbean Power Systems', 'Portmore']],
    about: 'Support project engineers on site and in the office, from design reviews to inspections, with training and a named mentor.',
    resp: ['Assist with drawings and design reviews', 'Join site visits and record findings', 'Help prepare project documentation'],
    req: ['Studying Mechanical, Electrical, Civil or Chemical Engineering', 'Familiar with CAD software', 'Comfortable working on site'],
    roles: [
      ['Mechanical Engineering Intern', 'Internship'], ['Electrical Engineering Intern', 'Internship'], ['Civil Engineering Intern', 'Internship'],
      ['Chemical Process Engineering Intern', 'Internship'], ['Renewable Energy Intern', 'Internship'], ['Maintenance Engineering Intern', 'Internship'],
      ['Graduate Mechanical Engineer', 'Graduate job'], ['Graduate Electrical Engineer', 'Graduate job'], ['Graduate Civil Engineer', 'Graduate job'],
    ],
  },
  {
    field: 'Construction', sector: 'Construction',
    employers: [['Ironwood Builders', 'Kingston'], ['Palm Grove Developments', 'Ocho Rios']],
    about: 'Learn how buildings go from plan to handover, working with site teams, surveyors and project managers.',
    resp: ['Support site supervisors with daily progress records', 'Assist with measurements, quantities and costings', 'Help prepare safety and quality documentation'],
    req: ['Studying Construction Management, Quantity Surveying, Architecture or Civil Engineering', 'Comfortable working outdoors', 'Safety conscious'],
    roles: [
      ['Quantity Surveying Intern', 'Internship'], ['Site Supervision Intern', 'Internship'], ['Architectural Technology Intern', 'Internship'],
      ['Project Coordination Intern', 'Internship'], ['Graduate Quantity Surveyor', 'Graduate job'], ['Graduate Site Engineer', 'Graduate job'],
    ],
  },
  {
    field: 'Business', sector: 'Marketing',
    employers: [['Pulse Creative', 'Kingston'], ['Sunrise Brands', 'New Kingston'], ['Tropic Retail Group', 'Portmore']],
    about: 'Support the commercial team on campaigns, customer work and reporting, with real responsibility from week one.',
    resp: ['Draft content and campaign material', 'Track results and prepare summaries', 'Coordinate with partners and suppliers'],
    req: ['Studying Marketing, Business Management or Communications', 'Strong writing skills', 'Organised and reliable'],
    roles: [
      ['Marketing Assistant Intern', 'Internship'], ['Social Media and Content Intern', 'Internship'], ['Sales and Business Development Intern', 'Internship'],
      ['Human Resources Intern', 'Internship'], ['Customer Experience Intern', 'Internship'], ['Project Management Intern', 'Internship'],
      ['Entrepreneurship and Operations Intern', 'Internship'], ['Graduate Marketing Executive', 'Graduate job'], ['Graduate HR Officer', 'Graduate job'],
      ['Graduate Business Analyst', 'Graduate job'],
    ],
  },
  {
    field: 'Finance', sector: 'Financial services',
    employers: [['Harbourview Bank', 'Kingston'], ['Meridian Assurance', 'New Kingston'], ['Palmetto Capital', 'Kingston']],
    about: 'Support the finance team with day-to-day operations, reconciliations and reporting, with structured training along the way.',
    resp: ['Reconcile accounts and process transactions', 'Help prepare month-end reports', 'Improve checklists and team processes'],
    req: ['Studying Accounting, Finance or Economics', 'Strong attention to detail', 'Confident with Excel'],
    roles: [
      ['Accounting Intern', 'Internship'], ['Audit Intern', 'Internship'], ['Investment Banking Intern', 'Internship'],
      ['Insurance Underwriting Intern', 'Internship'], ['Credit Risk Intern', 'Internship'], ['Treasury Operations Intern', 'Internship'],
      ['Graduate Accountant', 'Graduate job'], ['Graduate Credit Analyst', 'Graduate job'], ['Graduate Auditor', 'Graduate job'],
    ],
  },
  {
    field: 'Legal', sector: 'Legal services',
    employers: [['Whitfield and Grant Attorneys', 'Kingston'], ['Cornerstone Legal', 'Montego Bay']],
    about: 'Gain practical experience in a busy law firm, supporting attorneys with research, drafting and client matters.',
    resp: ['Research case law and legislation', 'Draft and proofread documents', 'Organise case files and prepare for hearings'],
    req: ['Studying Law, Legal Studies or Public Administration', 'Excellent writing and research skills', 'Discretion with confidential matters'],
    roles: [
      ['Legal Research Intern', 'Internship'], ['Paralegal Intern', 'Internship'], ['Compliance Intern', 'Internship'],
      ['Contracts and Corporate Law Intern', 'Internship'], ['Graduate Paralegal', 'Graduate job'], ['Graduate Compliance Officer', 'Graduate job'],
    ],
  },
  {
    field: 'Health', sector: 'Healthcare',
    employers: [['Carib Health Network', 'Montego Bay'], ['Blue Mountain Medical Centre', 'Kingston'], ['Sunrise Pharmacy Group', 'Mandeville']],
    about: 'Gain hands-on experience in a busy healthcare setting, working alongside clinical and administrative teams.',
    resp: ['Support clinical systems and patient records', 'Assist with data entry and quality checks', 'Help teams adopt new tools and processes'],
    req: ['Studying Health Sciences, Nursing, Pharmacy, Biology or IT', 'Respect for patient confidentiality', 'Reliable and organised'],
    roles: [
      ['Clinical Systems Intern', 'Internship'], ['Health Informatics Intern', 'Internship'], ['Pharmacy Assistant Intern', 'Internship'],
      ['Laboratory Technician Intern', 'Internship'], ['Public Health Research Intern', 'Internship'], ['Hospital Administration Intern', 'Internship'],
      ['Medical Records Intern', 'Internship'], ['Graduate Health Informatics Analyst', 'Graduate job'], ['Graduate Laboratory Technologist', 'Graduate job'],
    ],
  },
  {
    field: 'Science', sector: 'Science and research',
    employers: [['Lignum Research Institute', 'Kingston'], ['AgriTech Caribbean Labs', 'Spanish Town']],
    about: 'Contribute to applied research and quality work in a working laboratory, learning methods used across industry.',
    resp: ['Prepare samples and run routine tests', 'Record and analyse results carefully', 'Follow laboratory safety and quality procedures'],
    req: ['Studying Chemistry, Biology, Environmental Science or Physics', 'Careful and methodical', 'Comfortable with lab work'],
    roles: [
      ['Chemistry Laboratory Intern', 'Internship'], ['Environmental Monitoring Intern', 'Internship'], ['Quality Assurance Scientist Intern', 'Internship'],
      ['Marine Science Research Intern', 'Internship'], ['Graduate Research Assistant', 'Graduate job'], ['Graduate Quality Analyst', 'Graduate job'],
    ],
  },
  {
    field: 'Education', sector: 'Education',
    employers: [['Bright Futures Academy', 'Kingston'], ['Island Learning Foundation', 'Mandeville']],
    about: 'Support teachers and learners in the classroom and online, helping students reach their goals.',
    resp: ['Assist teachers with lessons and marking', 'Run small-group support sessions', 'Help prepare learning resources'],
    req: ['Studying Education, Psychology or a subject you want to teach', 'Patient and encouraging', 'Good communicator'],
    roles: [
      ['Teaching Assistant Intern', 'Internship'], ['Curriculum Development Intern', 'Internship'], ['Educational Technology Intern', 'Internship'],
      ['Student Support Intern', 'Internship'], ['Graduate Teacher Trainee', 'Graduate job'], ['Graduate Learning Designer', 'Graduate job'],
    ],
  },
  {
    field: 'Hospitality', sector: 'Hospitality and tourism',
    employers: [['Azure Bay Resorts', 'Ocho Rios'], ['Coral Cove Hotels', 'Montego Bay'], ['Jamaica Heritage Tours', 'Kingston']],
    about: 'Learn how a world-class resort or tourism business runs, from guest experience to operations and events.',
    resp: ['Support guest services and front-of-house teams', 'Assist with events and reservations', 'Gather guest feedback and share ideas'],
    req: ['Studying Hospitality, Tourism or Business', 'Friendly, professional manner', 'Comfortable with shift work'],
    roles: [
      ['Front Office Intern', 'Internship'], ['Events and Conferences Intern', 'Internship'], ['Food and Beverage Management Intern', 'Internship'],
      ['Tourism Marketing Intern', 'Internship'], ['Revenue Management Intern', 'Internship'], ['Graduate Hotel Operations Trainee', 'Graduate job'],
      ['Graduate Tour Operations Coordinator', 'Graduate job'],
    ],
  },
  {
    field: 'Logistics', sector: 'Logistics',
    employers: [['Island Freight Services', 'Portmore'], ['Harbour Gate Shipping', 'Kingston']],
    about: 'Help the operations team move goods more efficiently across warehouses, ports and delivery routes.',
    resp: ['Analyse delivery and inventory data', 'Support route and shipment planning', 'Prepare weekly operations reports'],
    req: ['Studying Business, Logistics, Supply Chain or Engineering', 'Confident with spreadsheets', 'Comfortable on site'],
    roles: [
      ['Supply Chain Intern', 'Internship'], ['Warehouse Operations Intern', 'Internship'], ['Freight Forwarding Intern', 'Internship'],
      ['Procurement Intern', 'Internship'], ['Graduate Logistics Analyst', 'Graduate job'], ['Graduate Procurement Officer', 'Graduate job'],
    ],
  },
  {
    field: 'Design', sector: 'Design',
    employers: [['Ashgrove Studio', 'Kingston'], ['Kaya Interactive', 'New Kingston']],
    about: 'Work in a creative studio, turning ideas into polished designs for brands, products and media.',
    resp: ['Create layouts, graphics and prototypes', 'Take feedback from senior designers', 'Prepare assets for print and digital delivery'],
    req: ['Studying Graphic Design, Fine Arts, Multimedia or Architecture', 'A portfolio of your work', 'Strong eye for detail'],
    roles: [
      ['UX/UI Design Intern', 'Internship'], ['Graphic Design Intern', 'Internship'], ['Video Production Intern', 'Internship'],
      ['Animation and Motion Graphics Intern', 'Internship'], ['Photography and Content Intern', 'Internship'], ['Graduate Product Designer', 'Graduate job'],
      ['Graduate Graphic Designer', 'Graduate job'],
    ],
  },
  {
    field: 'Agriculture', sector: 'Agriculture',
    employers: [['Green Valley Farms', 'Mandeville'], ['St. Elizabeth Produce Co-op', 'Spanish Town']],
    about: 'Learn modern farming and food-supply practice, from field work to packing, quality control and export.',
    resp: ['Support crop and livestock management', 'Record yields and quality data', 'Help with packing, safety and export paperwork'],
    req: ['Studying Agriculture, Agribusiness or Environmental Science', 'Comfortable working outdoors', 'Hard-working and reliable'],
    roles: [
      ['Agribusiness Intern', 'Internship'], ['Crop Science Intern', 'Internship'], ['Food Safety and Quality Intern', 'Internship'],
      ['Agricultural Technology Intern', 'Internship'], ['Graduate Farm Operations Officer', 'Graduate job'], ['Graduate Agronomist', 'Graduate job'],
    ],
  },
  {
    field: 'Media', sector: 'Media',
    employers: [['Riddim Radio and TV', 'Kingston'], ['Gleaner Digital Newsroom', 'Kingston']],
    about: 'Join a busy newsroom or production team and help create stories for Jamaican and global audiences.',
    resp: ['Research and draft stories or scripts', 'Assist with filming, editing or recording', 'Help publish across digital channels'],
    req: ['Studying Mass Communication, Journalism or Media Studies', 'Strong writing and storytelling', 'Curious and quick to learn'],
    roles: [
      ['Journalism Intern', 'Internship'], ['Broadcast Production Intern', 'Internship'], ['Digital Content Intern', 'Internship'],
      ['Public Relations Intern', 'Internship'], ['Graduate Reporter', 'Graduate job'], ['Graduate Content Producer', 'Graduate job'],
    ],
  },
];

// Pay bands per field (monthly for internships, yearly for graduate jobs), in J$.
const PAY = {
  Computing: [120000, 3600000], Data: [110000, 3300000], Engineering: [115000, 3400000], Construction: [105000, 3100000],
  Business: [95000, 2800000], Finance: [130000, 3300000], Legal: [110000, 3000000], Health: [100000, 3100000],
  Science: [100000, 2900000], Education: [90000, 2600000], Hospitality: [90000, 2600000], Logistics: [100000, 3000000],
  Design: [100000, 2900000], Agriculture: [90000, 2700000], Media: [90000, 2600000],
};
const money = (n) => `J$${n.toLocaleString('en-US')}`;

let created = 0;
let skipped = 0;
let employersMade = 0;
let seq = 0;
for (const c of careers) {
  // Make sure each employer exists (verified, ready to hire).
  const emps = [];
  for (const [company, city] of c.employers) {
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const email = `careers@${slug}.demo`;
    let u = await User.findOne({ email });
    if (!u) {
      u = await User.create({
        name: `${company} Recruitment`, email, passwordHash: hash, role: 'EMPLOYER', status: 'active', onboarded: true,
        employer: { company, sector: c.sector, city, contactTitle: 'Early Careers Lead', website: `${slug}.demo`, about: `${company} hosts UTech interns and graduates.` },
      });
      employersMade++;
    }
    emps.push({ u, city });
  }

  c.roles.forEach(([title, type], i) => {
    c.queue = c.queue || [];
    c.queue.push({ title, type, emp: emps[i % emps.length], i });
  });

  for (const { title, type, emp, i } of c.queue) {
    if (await Opportunity.exists({ employer: emp.u._id, title })) { skipped++; continue; }
    seq++;
    const internship = type === 'Internship';
    const [monthly, yearly] = PAY[c.field];
    const bump = (seq % 4) * 5000; // a little variety between roles
    const mode = MODES[seq % 3];
    const location = mode === 'Remote' ? 'Remote (Jamaica)' : seq % 5 === 0 ? CITIES[seq % (CITIES.length - 1)] : emp.city;
    const deadline = 12 + ((seq * 7) % 50);
    const start = deadline + 30 + (internship ? 20 : 60);
    await Opportunity.create({
      code: await nextCode('OP'), employer: emp.u._id, title, type, field: c.field, location, workMode: mode,
      duration: internship ? ['10 weeks', '12 weeks', '6 months'][i % 3] : 'Permanent',
      positions: 1 + (seq % 4),
      pay: internship ? `${money(monthly + bump)} per month` : `${money(yearly + bump * 12)} per year`,
      status: 'open', startDate: ymd(inDays(start)), deadline: inDays(deadline),
      about: c.about, responsibilities: c.resp, requirements: c.req,
    });
    created++;
  }
}

console.log(`Added ${created} open opportunities across ${careers.length} career paths (${skipped} already existed, ${employersMade} new employers).`);
console.log(`Demo employer logins use password ${DEMO_PASSWORD}, e.g. careers@bytewavelabs.demo`);
await mongoose.disconnect();

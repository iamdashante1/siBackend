import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, client, makeAdmin, register, validOpportunity } from './helpers.js';
import { User } from '../src/models/User.js';

let ctx;
const student = {}, employer = {}, stranger = {}, admin = {};

before(async () => {
  ctx = await startTestApp();
  await makeAdmin();
  for (const c of [student, employer, stranger, admin]) c.http = client(ctx.app);
});
after(() => ctx.stop());

test('students update their profile and upload a PDF CV; others are kept out', async () => {
  await register(student.http, 'STUDENT', 'Kezia Reid', 'kezia@test.local');
  const bad = await student.http.put('/api/profile', { email: 'nope', year: 9, skills: [] });
  assert.equal(bad.status, 400);

  const ok = await student.http.put('/api/profile', { email: 'kezia@test.local', phone: '(876) 555-0100', year: 2, skills: ['Git', 'Git', 'SQL'], programme: 'BSc Computing' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.user.student.skills, ['Git', 'SQL'], 'duplicate skills collapse');

  const pdf = Buffer.from('%PDF-1.4 test cv').toString('base64');
  assert.equal((await student.http.put('/api/profile/cv', { name: 'cv.pdf', data: Buffer.from('not a pdf').toString('base64') })).status, 400);
  const up = await student.http.put('/api/profile/cv', { name: 'cv.pdf', data: pdf });
  assert.equal(up.status, 200);
  assert.equal(up.body.user.cvInfo.name, 'cv.pdf');
  assert.equal(up.body.user.cv, undefined, 'CV bytes are never sent in JSON');

  // employer with no application from this student cannot read the CV
  const me = (await student.http.get('/api/auth/me')).body.user;
  await register(stranger.http, 'EMPLOYER', 'Other', 'other@test.local', { organisation: 'Other Co' });
  assert.equal((await stranger.http.get(`/api/profile/cv/${me.id}`)).status, 403);
  assert.equal((await student.http.get(`/api/profile/cv/${me.id}`)).status, 200);
});

test('an employer can read the CV of a student who applied to them', async () => {
  const empUser = await register(employer.http, 'EMPLOYER', 'Boss', 'boss@test.local', { organisation: 'Boss Co' });
  await User.updateOne({ _id: empUser.id }, { status: 'active' });
  await admin.http.post('/api/auth/login', { email: 'admin@test.local', password: 'Admin1234' });

  const created = await employer.http.post('/api/opportunities?submit=1', validOpportunity());
  assert.equal(created.status, 201);
  await admin.http.post(`/api/opportunities/${created.body.opportunity.id}/approve`);

  const app = await student.http.post('/api/applications', {
    opportunityId: created.body.opportunity.id,
    coverLetter: 'I would like to apply because the role matches my studies in computing and my project experience.',
  });
  assert.equal(app.status, 201);
  const me = (await student.http.get('/api/auth/me')).body.user;
  const res = await employer.http.get(`/api/profile/cv/${me.id}`);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /pdf/);
});

test('admin reports and CSV exports work, and escape formulas', async () => {
  const rep = await admin.http.get('/api/admin/reports');
  assert.equal(rep.status, 200);
  assert.ok(rep.body.programmes.find((p) => p.programme === 'BSc Computing'));
  const csv = await admin.http.get('/api/admin/export/students');
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.text, /Kezia Reid/);
  assert.equal((await student.http.get('/api/admin/export/students')).status, 403);
  assert.equal((await admin.http.get('/api/admin/export/bogus')).status, 404);
});

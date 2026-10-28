import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, client, makeAdmin, register, validOpportunity, futureDate } from './helpers.js';
import { User } from '../src/models/User.js';

let ctx;
const admin = {}, employer = {}, student = {}, other = {};
let oppId, appId;

before(async () => {
  ctx = await startTestApp();
  await makeAdmin();
  for (const c of [admin, employer, student, other]) c.http = client(ctx.app);
});
after(() => ctx.stop());

// ---------------- authentication ----------------
test('registration validates input and rejects admin signups', async () => {
  const c = client(ctx.app);
  let res = await c.post('/api/auth/register', { role: 'STUDENT', name: 'A', email: 'bad', password: 'short' });
  assert.equal(res.status, 400);
  assert.ok(res.body.fields.email && res.body.fields.password);

  res = await c.post('/api/auth/register', { role: 'ADMIN', name: 'Mallory', email: 'm@x.com', password: 'Passw0rd1' });
  assert.equal(res.status, 400, 'public registration must not create admins');

  res = await c.post('/api/auth/register', { role: 'EMPLOYER', name: 'Emp', email: 'noorg@x.com', password: 'Passw0rd1' });
  assert.equal(res.status, 400);
  assert.ok(res.body.fields.organisation);
});

test('register, login, me, logout and password hygiene', async () => {
  const user = await register(student.http, 'STUDENT', 'Shanice Campbell', 'shanice@test.local');
  assert.equal(user.role, 'STUDENT');
  assert.equal(user.passwordHash, undefined, 'hash must never be returned');
  const stored = await User.findOne({ email: 'shanice@test.local' });
  assert.notEqual(stored.passwordHash, 'Passw0rd1');
  assert.match(stored.passwordHash, /^\$2[aby]\$/);

  assert.equal((await student.http.get('/api/auth/me')).body.user.email, 'shanice@test.local', 'session persists');

  const dup = await client(ctx.app).post('/api/auth/register', { role: 'STUDENT', name: 'Dup', email: 'SHANICE@test.local', password: 'Passw0rd1' });
  assert.equal(dup.status, 409);

  const anon = client(ctx.app);
  assert.equal((await anon.post('/api/auth/login', { email: 'shanice@test.local', password: 'wrong-pass1' })).status, 401);
  assert.equal((await anon.post('/api/auth/login', { email: 'nobody@test.local', password: 'Passw0rd1' })).status, 401);
  assert.equal((await anon.post('/api/auth/login', { email: 'shanice@test.local', password: 'Passw0rd1', role: 'EMPLOYER' })).status, 401);
  assert.equal((await anon.post('/api/auth/login', { email: 'shanice@test.local', password: 'Passw0rd1', role: 'STUDENT' })).status, 200);

  assert.equal((await student.http.post('/api/auth/logout')).status, 200);
  assert.equal((await student.http.get('/api/auth/me')).body.user, null);
  assert.equal((await student.http.get('/api/applications')).status, 401);
  await student.http.post('/api/auth/login', { email: 'shanice@test.local', password: 'Passw0rd1' });
});

test('state-changing requests without the CSRF header are refused', async () => {
  const request = (await import('supertest')).default;
  const res = await request(ctx.app).post('/api/auth/login').send({ email: 'a@b.com', password: 'x' });
  assert.equal(res.status, 403);
});

test('protected routes reject unauthenticated users and wrong roles', async () => {
  const anon = client(ctx.app);
  for (const url of ['/api/opportunities', '/api/applications', '/api/placements', '/api/admin/overview']) {
    assert.equal((await anon.get(url)).status, 401, url);
  }
  assert.equal((await student.http.get('/api/admin/overview')).status, 403);
  assert.equal((await student.http.post('/api/opportunities', validOpportunity())).status, 403);
});

// ---------------- employer verification & opportunities ----------------
test('unverified employers can draft but not submit; admin verifies', async () => {
  await register(employer.http, 'EMPLOYER', 'Andre Williams', 'andre@halden.test', { organisation: 'Halden Systems' });
  const submit = await employer.http.post('/api/opportunities?submit=1', validOpportunity());
  assert.equal(submit.status, 403);

  const draft = await employer.http.post('/api/opportunities', validOpportunity());
  assert.equal(draft.status, 201);
  assert.equal(draft.body.opportunity.status, 'draft');
  assert.equal(draft.body.opportunity.employer, (await employer.http.get('/api/auth/me')).body.user.id);

  await admin.http.post('/api/auth/login', { email: 'admin@test.local', password: 'Admin1234', role: 'ADMIN' });
  const employers = await admin.http.get('/api/admin/employers');
  const emp = employers.body.employers.find((e) => e.email === 'andre@halden.test');
  assert.equal(emp.status, 'unverified');
  assert.equal((await admin.http.patch(`/api/admin/users/${emp.id}/status`, { status: 'active' })).body.user.status, 'active');
});

test('create, validate, submit, approve and list an opportunity', async () => {
  const bad = await employer.http.post('/api/opportunities?submit=1', validOpportunity({ deadline: futureDate(-3) }));
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.deadline);

  const created = await employer.http.post('/api/opportunities?submit=1', validOpportunity());
  assert.equal(created.status, 201);
  oppId = created.body.opportunity.id;
  assert.equal(created.body.opportunity.status, 'pending_approval');

  // Students cannot see it yet.
  assert.equal((await student.http.get('/api/opportunities')).body.opportunities.length, 0);
  assert.equal((await student.http.get(`/api/opportunities/${oppId}`)).status, 404);

  assert.equal((await employer.http.post(`/api/opportunities/${oppId}/approve`)).status, 403, 'employers cannot approve');
  assert.equal((await admin.http.post(`/api/opportunities/${oppId}/approve`)).status, 200);

  const list = await student.http.get('/api/opportunities?q=software&type=Internship&mode=Hybrid');
  assert.equal(list.body.opportunities.length, 1);
  assert.equal(list.body.opportunities[0].employer.employer.company, 'Halden Systems');
  assert.equal((await student.http.get('/api/opportunities?q=nothing-like-this')).body.opportunities.length, 0);
  assert.equal((await student.http.get('/api/opportunities/not-an-id')).status, 404);
});

test("an employer cannot touch another employer's opportunity", async () => {
  await register(other.http, 'EMPLOYER', 'Rival', 'rival@other.test', { organisation: 'Rival Co' });
  assert.equal((await other.http.put(`/api/opportunities/${oppId}`, validOpportunity())).status, 404);
  assert.equal((await other.http.post(`/api/opportunities/${oppId}/close`)).status, 404);
  assert.equal((await other.http.get(`/api/opportunities/${oppId}`)).status, 404);
  assert.equal((await other.http.get('/api/opportunities')).body.opportunities.length, 0);
});

// ---------------- applications ----------------
test('student applies once; duplicates and short letters are rejected', async () => {
  const short = await student.http.post('/api/applications', { opportunityId: oppId, coverLetter: 'too short' });
  assert.equal(short.status, 400);

  const letter = 'I am a third-year computing student and would love to join your engineering team this summer.';
  const ok = await student.http.post('/api/applications', { opportunityId: oppId, coverLetter: letter });
  assert.equal(ok.status, 201);
  appId = ok.body.application.id;
  assert.equal(ok.body.application.status, 'submitted');

  const dup = await student.http.post('/api/applications', { opportunityId: oppId, coverLetter: letter });
  assert.equal(dup.status, 409);

  const mine = await student.http.get('/api/opportunities');
  assert.ok(mine.body.opportunities[0].myApplication);
});

test('employers only see applications to their own opportunities', async () => {
  assert.equal((await employer.http.get('/api/applications')).body.applications.length, 1);
  assert.equal((await other.http.get('/api/applications')).body.applications.length, 0);
  assert.equal((await other.http.get(`/api/applications/${appId}`)).status, 404);
  assert.equal((await other.http.post(`/api/applications/${appId}/shortlist`)).status, 404);
  assert.equal((await student.http.post(`/api/applications/${appId}/shortlist`)).status, 403, 'students cannot shortlist themselves');
});

test('status transitions are enforced on the server', async () => {
  // submitted -> offer is not allowed
  assert.equal((await employer.http.post(`/api/applications/${appId}/offer`)).status, 409);
  assert.equal((await employer.http.post(`/api/applications/${appId}/shortlist`)).status, 200);

  // placement cannot exist before an offer is accepted
  assert.equal((await admin.http.post('/api/placements', { applicationId: appId })).status, 409);

  // interviews: must be in the future
  const past = await employer.http.post('/api/interviews', { applicationId: appId, startsAt: new Date(Date.now() - 3600000).toISOString(), format: 'Video call' });
  assert.equal(past.status, 400);
  const when = new Date(Date.now() + 5 * 86400000).toISOString();
  const sched = await employer.http.post('/api/interviews', { applicationId: appId, startsAt: when, format: 'Video call' });
  assert.equal(sched.status, 201);
  assert.equal((await student.http.get(`/api/applications/${appId}`)).body.application.status, 'interview');
  assert.equal((await student.http.get('/api/interviews')).body.interviews.length, 1);
  assert.equal((await other.http.get('/api/interviews')).body.interviews.length, 0);

  // student cannot accept before an offer
  assert.equal((await student.http.post(`/api/applications/${appId}/accept`)).status, 409);
  assert.equal((await employer.http.post(`/api/applications/${appId}/offer`)).status, 200);
});

test('accepting an offer creates a pending placement; admin moves it through its lifecycle', async () => {
  const accept = await student.http.post(`/api/applications/${appId}/accept`);
  assert.equal(accept.status, 200);
  assert.equal(accept.body.placement.status, 'p_pending');

  const mine = await student.http.get('/api/placements');
  assert.equal(mine.body.placements.length, 1);
  assert.equal((await other.http.get('/api/placements')).body.placements.length, 0);
  const id = mine.body.placements[0].id;

  assert.equal((await student.http.post(`/api/placements/${id}/advance`)).status, 403);
  assert.equal((await admin.http.post(`/api/placements/${id}/advance`)).body.placement.status, 'p_confirmed');
  // start date is ~200 days away, so the placement cannot be activated yet
  assert.equal((await admin.http.post(`/api/placements/${id}/advance`)).status, 409);
  assert.equal((await admin.http.post(`/api/placements/${id}/notes`, { text: 'Orientation done' })).status, 201);

  const report = await admin.http.get('/api/admin/reports');
  assert.equal(report.body.placementsByStatus.p_confirmed, 1);
  assert.equal(report.body.applicationsByStatus.accepted, 1);
  const csv = await admin.http.get('/api/admin/export/placements');
  assert.match(csv.text, /PL-1001,Shanice Campbell,Halden Systems/);
});

test('withdrawn applications can be re-submitted; closing stops new applications', async () => {
  const s2 = client(ctx.app);
  await register(s2, 'STUDENT', 'Jordan Chin', 'jordan@test.local');
  const letter = 'I am excited about this opportunity and have relevant coursework and project experience.';
  const a = await s2.post('/api/applications', { opportunityId: oppId, coverLetter: letter });
  assert.equal(a.status, 201);
  assert.equal((await s2.post(`/api/applications/${a.body.application.id}/withdraw`)).status, 200);
  assert.equal((await employer.http.get('/api/applications')).body.applications.length, 1, 'withdrawn is hidden from employer');
  assert.equal((await s2.post('/api/applications', { opportunityId: oppId, coverLetter: letter })).status, 201, 're-apply works');

  assert.equal((await employer.http.post(`/api/opportunities/${oppId}/close`)).status, 200);
  const s3 = client(ctx.app);
  await register(s3, 'STUDENT', 'Late Student', 'late@test.local');
  assert.equal((await s3.post('/api/applications', { opportunityId: oppId, coverLetter: letter })).status, 404);
});

test('suspended accounts lose access immediately', async () => {
  const s4 = client(ctx.app);
  const u = await register(s4, 'STUDENT', 'To Suspend', 'suspend@test.local');
  assert.equal((await s4.get('/api/opportunities')).status, 200);
  await admin.http.patch(`/api/admin/users/${u.id}/status`, { status: 'suspended' });
  assert.equal((await s4.get('/api/opportunities')).status, 401);
  assert.equal((await client(ctx.app).post('/api/auth/login', { email: 'suspend@test.local', password: 'Passw0rd1' })).status, 403);
});

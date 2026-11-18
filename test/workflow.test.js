import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, client, makeAdmin, loginAdmin, TEST_PASSWORD, register, validOpportunity, futureDate } from './helpers.js';
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
test('registration creates the account; admin role is not trusted', async () => {
  // A sign-up that asks to be an admin only ever becomes a student.
  const m = client(ctx.app);
  const mallory = await register(m, 'ADMIN', 'Mallory', 'm@x.com');
  assert.equal(mallory.role, 'STUDENT', 'sign-up must not create admins');

  // Employers start unverified and keep the organisation they typed.
  const e = client(ctx.app);
  const emp = await register(e, 'EMPLOYER', 'Emp', 'emp@x.com', { organisation: 'Emp Co' });
  assert.equal(emp.role, 'EMPLOYER');
  assert.equal(emp.status, 'unverified');
  assert.equal(emp.employer.company, 'Emp Co');

  // Duplicate emails are refused.
  assert.equal((await client(ctx.app).post('/api/auth/register', { role: 'STUDENT', name: 'Dup', email: 'admin@test.local', password: TEST_PASSWORD })).status, 409);
});

test('sign-in, me, sign-out and no password data', async () => {
  const user = await register(student.http, 'STUDENT', 'Shanice Campbell', 'shanice@test.local');
  assert.equal(user.role, 'STUDENT');
  assert.equal(user.passwordHash, undefined, 'hash must never be returned');
  const stored = await User.findOne({ email: 'shanice@test.local' });
  assert.ok(stored.passwordHash.startsWith('$2'), 'password is stored as a bcrypt hash');

  assert.equal((await student.http.get('/api/auth/me')).body.user.email, 'shanice@test.local');
  // Logging in again finds the same account; wrong password and wrong tab are refused.
  const again = client(ctx.app);
  assert.equal((await again.post('/api/auth/login', { email: 'shanice@test.local', password: 'wrongpass1' })).status, 401);
  assert.equal((await again.post('/api/auth/login', { email: 'shanice@test.local', password: TEST_PASSWORD, role: 'EMPLOYER' })).status, 401);
  const ok = await again.post('/api/auth/login', { email: 'shanice@test.local', password: TEST_PASSWORD, role: 'STUDENT' });
  assert.equal(ok.body.user.id, user.id);
  assert.equal((await again.get('/api/auth/me')).body.user.id, user.id);
  await again.post('/api/auth/logout');
  assert.equal((await again.get('/api/auth/me')).body.user, null, 'logout clears the cookie');

  // A tampered token is rejected.
  const request = (await import('supertest')).default;
  const forged = await request(ctx.app).get('/api/applications').set('Authorization', 'Bearer not.a.jwt');
  assert.equal(forged.status, 401);

  // Signed out means no user and no access.
  const anon = client(ctx.app);
  assert.equal((await anon.get('/api/auth/me')).body.user, null);
  assert.equal((await anon.get('/api/applications')).status, 401);
});

test('state-changing requests without the CSRF header are refused', async () => {
  const request = (await import('supertest')).default;
  const res = await request(ctx.app).post('/api/opportunities').send({});
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

  await loginAdmin(admin.http);
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
  assert.equal((await s4.get('/api/opportunities')).status, 403);
  assert.equal((await s4.get('/api/auth/me')).status, 403);
});

test('opportunity list paginates only when asked', async () => {
  const all = await admin.http.get('/api/opportunities');
  assert.equal(all.status, 200);
  assert.equal(all.body.page, undefined, 'unpaged by default');
  const total = all.body.opportunities.length;
  assert.ok(total >= 1);

  const first = await admin.http.get('/api/opportunities?page=1&limit=1');
  assert.equal(first.body.total, total);
  assert.equal(first.body.pages, total);
  assert.equal(first.body.opportunities.length, 1);
  assert.equal(first.body.opportunities[0].id, all.body.opportunities[0].id);

  const beyond = await admin.http.get('/api/opportunities?page=999&limit=1');
  assert.equal(beyond.body.page, total, 'page is clamped to the last one');
});

test('opportunity list filters by field, sorts, and returns facets', async () => {
  const base = await admin.http.get('/api/opportunities?page=1&limit=50');
  assert.ok(Array.isArray(base.body.fields));
  assert.equal(typeof base.body.counts, 'object');
  const field = base.body.opportunities.find((o) => o.field)?.field;
  if (field) {
    const r = await admin.http.get(`/api/opportunities?page=1&field=${encodeURIComponent(field)}`);
    assert.ok(r.body.opportunities.every((o) => o.field === field));
  }
  const none = await admin.http.get('/api/opportunities?page=1&field=__nope__');
  assert.equal(none.body.total, 0);
  const newest = await admin.http.get('/api/opportunities?page=1&sort=newest');
  assert.equal(newest.status, 200);
});

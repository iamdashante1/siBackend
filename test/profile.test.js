import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, TEST_PASSWORD, client, makeAdmin, loginAdmin, register, validOpportunity, futureDate } from './helpers.js';
import { User } from '../src/models/User.js';
import { photoStore } from '../src/lib/cloudinary.js';

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
  await loginAdmin(admin.http);

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

test('deleting an account needs the password and removes the user and their data', async () => {
  const h = client(ctx.app);
  await register(h, 'STUDENT', 'Temp Student', 'temp@test.local');
  assert.equal((await h.delete('/api/profile', {})).status, 400, 'password is required');
  // A wrong password must not look like an expired session (the UI signs out on 401).
  assert.equal((await h.delete('/api/profile', { password: 'wrong-pass1' })).status, 403);
  assert.ok((await h.get('/api/auth/me')).body.user, 'still signed in after a wrong password');
  assert.ok(await User.exists({ email: 'temp@test.local' }));

  assert.equal((await h.post('/api/profile/delete', { password: 'wrong-pass1' })).status, 403);
  const res = await h.post('/api/profile/delete', { password: TEST_PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(await User.exists({ email: 'temp@test.local' }), null);
  assert.equal((await h.get('/api/auth/me')).body.user, null);
});

test('deleting an employer removes their opportunities and the applications to them', async () => {
  const emp = client(ctx.app), stu = client(ctx.app), adm = client(ctx.app);
  await loginAdmin(adm);
  const empUser = await register(emp, 'EMPLOYER', 'Gone Boss', 'goneboss@test.local', { organisation: 'Gone Co' });
  const stuUser = await register(stu, 'STUDENT', 'Applicant', 'applicant@test.local');
  await User.updateOne({ _id: empUser.id }, { status: 'active' });

  const opp = await emp.post('/api/opportunities?submit=1', validOpportunity({ deadline: futureDate(10) }));
  assert.equal(opp.status, 201);
  const oppId = opp.body.opportunity.id;
  assert.equal((await adm.post(`/api/opportunities/${oppId}/approve`)).status, 200);
  const letter = 'I am a third-year computing student and would love to join your engineering team this summer.';
  const app = await stu.post('/api/applications', { opportunityId: oppId, coverLetter: letter });
  assert.equal(app.status, 201);

  assert.equal((await emp.delete('/api/profile', { password: TEST_PASSWORD })).status, 200);
  assert.equal(await User.exists({ _id: empUser.id }), null);
  assert.equal((await stu.get(`/api/opportunities/${oppId}`)).status, 404, 'their opportunity is gone');
  assert.equal((await stu.get('/api/applications')).body.applications.length, 0, 'applications to it are gone');
  assert.ok(await User.exists({ _id: stuUser.id }), 'the student is untouched');
});

test('administrators cannot delete their account', async () => {
  const adm = client(ctx.app);
  await loginAdmin(adm);
  assert.equal((await adm.delete('/api/profile', { password: TEST_PASSWORD })).status, 403);
  assert.ok(await User.exists({ email: 'admin@test.local' }));
});

test('profile photo: validated, stored through the photo store, replaceable, removable, cleaned up on delete', async () => {
  const real = { ...photoStore };
  const calls = { uploads: [], removed: [] };
  const h = client(ctx.app);
  try {
    await register(h, 'STUDENT', 'Photo Student', 'photo@test.local');
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]).toString('base64');

    // Not configured: clear message, nothing stored.
    photoStore.enabled = () => false;
    assert.equal((await h.put('/api/profile/photo', { data: png })).status, 503);

    photoStore.enabled = () => true;
    photoStore.upload = async (buf, userId) => {
      calls.uploads.push({ size: buf.length, userId });
      return { url: `https://res.cloudinary.com/demo/image/upload/avatars/user_${userId}.png`, publicId: `placeme/avatars/user_${userId}` };
    };
    photoStore.remove = async (id) => calls.removed.push(id);

    assert.equal((await h.put('/api/profile/photo', {})).status, 400, 'image required');
    const notImage = await h.put('/api/profile/photo', { data: Buffer.from('hello world').toString('base64') });
    assert.equal(notImage.status, 400);
    assert.match(notImage.body.error, /JPEG, PNG or WebP/);
    const huge = await h.put('/api/profile/photo', { data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2 * 1024 * 1024)]).toString('base64') });
    assert.equal(huge.status, 400);
    assert.equal(calls.uploads.length, 0, 'rejected files never reach Cloudinary');

    const ok = await h.put('/api/profile/photo', { data: `data:image/png;base64,${png}` });
    assert.equal(ok.status, 200);
    assert.match(ok.body.user.avatar.url, /^https:\/\/res\.cloudinary\.com\//);
    assert.equal(calls.uploads.length, 1);
    const me = (await h.get('/api/auth/me')).body.user;
    assert.equal(me.avatar.url, ok.body.user.avatar.url, 'the photo comes back with the user');

    const gone = await h.delete('/api/profile/photo');
    assert.equal(gone.status, 200);
    assert.equal(gone.body.user.avatar, undefined);
    assert.equal(calls.removed.length, 1);

    // Deleting the account also removes the stored photo.
    await h.put('/api/profile/photo', { data: png });
    calls.removed.length = 0;
    assert.equal((await h.delete('/api/profile', { password: TEST_PASSWORD })).status, 200);
    assert.equal(calls.removed.length, 1);
  } finally {
    Object.assign(photoStore, real);
  }
});

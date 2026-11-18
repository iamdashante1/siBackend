import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';

process.env.NODE_ENV = 'test';

// Starts an in-memory MongoDB and the Express app. Each test file calls this once.
export async function startTestApp() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri('placeme_test');
  await mongoose.connect(uri);
  const app = createApp({ production: false });
  return {
    app,
    async stop() {
      await mongoose.disconnect();
      await mongod.stop();
    },
  };
}

// A supertest client that sends the CSRF header. Its cookie jar keeps the JWT after register/login.
export function client(app) {
  const agent = request.agent(app);
  const wrapped = {};
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
    wrapped[m] = (url, body) => {
      const r = agent[m](url).set('X-Requested-With', 'placeme');
      return body === undefined ? r : r.send(body);
    };
  }
  return wrapped;
}

export const TEST_PASSWORD = 'Passw0rd123';

// An admin exists before anyone logs in (the seed script creates them).
export async function makeAdmin(email = 'admin@test.local') {
  return User.create({ name: 'Test Admin', email, role: 'ADMIN', passwordHash: await bcrypt.hash(TEST_PASSWORD, 4) });
}
export async function loginAdmin(c, email = 'admin@test.local') {
  const res = await c.post('/api/auth/login', { email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.user;
}

// Registers through the real endpoint and leaves the client logged in. Returns the app user.
export async function register(c, role, name, email, extra = {}) {
  const res = await c.post('/api/auth/register', { role, name, email, password: TEST_PASSWORD, organisation: extra.organisation });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.user;
}

export const futureDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export const validOpportunity = (over = {}) => ({
  title: 'Software Engineering Intern',
  type: 'Internship',
  field: 'Computing',
  location: 'Kingston',
  workMode: 'Hybrid',
  startDate: futureDate(200),
  duration: '12 weeks',
  positions: 2,
  pay: 'J$120,000 per month',
  about: 'Build features with the product team.',
  responsibilities: ['Write code'],
  requirements: ['Studying computing'],
  deadline: futureDate(30),
  ...over,
});

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';

process.env.NODE_ENV = 'test';

// Starts an in-memory MongoDB and the Express app. Each test file calls this once.
export async function startTestApp() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri('placeme_test');
  await mongoose.connect(uri);
  const app = createApp({ mongoUrl: uri, secret: 'test-secret', production: false });
  return {
    app,
    async stop() {
      await app.locals.sessionStore.close();
      await mongoose.disconnect();
      await mongod.stop();
    },
  };
}

// A supertest agent that keeps cookies and sends the CSRF header automatically.
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

export async function makeAdmin(email = 'admin@test.local', password = 'Admin1234') {
  return User.create({ name: 'Test Admin', email, passwordHash: await bcrypt.hash(password, 4), role: 'ADMIN' });
}

export async function register(c, role, name, email, extra = {}) {
  const res = await c.post('/api/auth/register', { role, name, email, password: 'Passw0rd1', ...extra });
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

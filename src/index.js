import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));

try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log('Connected to MongoDB');
} catch (err) {
  console.error(`Could not connect to MongoDB at the MONGODB_URI in your .env.\n${err.message}`);
  process.exit(1);
}

const app = createApp({ mongoUrl: config.mongoUri });

// In production the built React app is served by this same server (same origin, so cookies just work).
const clientDist = path.resolve(here, '../../frontend/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(config.port, () => console.log(`PlaceMe API listening on http://localhost:${config.port}`));

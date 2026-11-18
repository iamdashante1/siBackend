import 'dotenv/config';

const env = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || (env === 'production' ? '' : 'dev-only-insecure-secret');

// CLOUDINARY_URL (cloudinary://key:secret@cloud) or the three separate variables.
const fromUrl = (process.env.CLOUDINARY_URL || '').match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
const cloudinary = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || fromUrl?.[3] || '',
  apiKey: process.env.CLOUDINARY_API_KEY || fromUrl?.[1] || '',
  apiSecret: process.env.CLOUDINARY_API_SECRET || fromUrl?.[2] || '',
};
cloudinary.configured = !!(cloudinary.cloudName && cloudinary.apiKey && cloudinary.apiSecret);

export const config = {
  cloudinary,
  port: Number(process.env.PORT) || 4000,
  env,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/placeme',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

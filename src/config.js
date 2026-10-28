import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 4000,
  env: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/placeme',
  sessionSecret: process.env.SESSION_SECRET || '',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};

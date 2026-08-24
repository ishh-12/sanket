import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import app from './app.js';
import connectDB from './config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Always resolve backend/.env relative to this file, regardless of working directory.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── Environment validation ────────────────────────────────────────────────────

const REQUIRED_ENV = ['MONGODB_URI', 'AGENT_API_TOKEN'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k] && !process.env['MONGO_URI']);

if (missing.length > 0) {
  // MONGO_URI is the legacy key accepted as fallback for MONGODB_URI
  const reallyMissing = missing.filter(
    (k) => k !== 'MONGODB_URI' || !process.env['MONGO_URI']
  );
  if (reallyMissing.length > 0) {
    console.error('--------------------------------------------------');
    console.error('SANKET backend: missing required environment variables:');
    reallyMissing.forEach((k) => console.error(`  - ${k}`));
    console.error('Copy backend/.env.example to backend/.env and fill in the values.');
    console.error('--------------------------------------------------');
    process.exit(1);
  }
}

const PORT = Number(process.env.PORT || 5000);

const start = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error('--------------------------------------------------');
    console.error('SANKET backend cannot start: MongoDB is unavailable.');
    console.error('Verify MONGODB_URI in backend/.env, then retry.');
    console.error('Error:', error.message);
    console.error('--------------------------------------------------');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log('========================================');
    console.log(`SANKET Backend  v0.1.0`);
    console.log(`Listening on    http://localhost:${PORT}`);
    console.log(`Health check    http://localhost:${PORT}/api/health`);
    console.log(`Agent register  POST /api/device/register`);
    console.log(`Agent heartbeat POST /api/device/heartbeat`);
    console.log(`Agent metrics   POST /api/device/metrics`);
    console.log('========================================');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error('--------------------------------------------------');
      console.error(`Port ${PORT} is already in use.`);
      console.error('Another SANKET backend instance is probably running.');
      console.error('Stop it first:');
      console.error(`  netstat -ano | findstr :${PORT}  then  taskkill /PID <pid> /F`);
      console.error('--------------------------------------------------');
      process.exit(1);
    }
    console.error('[SANKET] Server error:', error);
    process.exit(1);
  });
};

process.on('unhandledRejection', (reason) => {
  console.error('[SANKET] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[SANKET] Uncaught exception:', error);
  process.exit(1);
});

start();

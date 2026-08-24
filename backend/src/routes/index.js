import { Router } from 'express';
import mongoose from 'mongoose';
import deviceRoute from './device.js';
import diagnosisRoute from './diagnosis.js';
import storageRoute from './storage.js';
import healingRoute from './healing.js';
import predictionRoute from './prediction.js';

const router = Router();

// ── Health endpoint ────────────────────────────────────────────────────────────
// Returns backend and database status separately.
// backend: "ok"  always means the Express process is reachable.
// database: reflects the live Mongoose readyState.
router.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  // 0=disconnected 1=connected 2=connecting 3=disconnecting
  const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
  const healthy = dbState === 1;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    backend: 'ok',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
});

router.use('/device', deviceRoute);
router.use('/diagnosis', diagnosisRoute);
router.use('/storage', storageRoute);
router.use('/healing', healingRoute);
router.use('/prediction', predictionRoute);

router.get('/', (req, res) => {
  res.json({ success: true, message: 'SANKET backend is online' });
});

export default router;

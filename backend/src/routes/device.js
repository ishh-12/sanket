import { Router } from 'express';
import {
  validateAgentToken,
  registerDevice,
  heartbeat,
  recordMetrics,
  getDeviceInfo,
  getDeviceById,
  getDeviceMetrics,
} from '../controllers/deviceController.js';

const router = Router();

// Agent endpoints (require X-Agent-Token)
router.post('/register', validateAgentToken, registerDevice);
router.post('/heartbeat', validateAgentToken, heartbeat);
router.post('/metrics', validateAgentToken, recordMetrics);

// Frontend endpoints (no auth required for now)
router.get('/', getDeviceInfo);
router.get('/:deviceId', getDeviceById);
router.get('/:deviceId/metrics', getDeviceMetrics);

export default router;

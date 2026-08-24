import { Router } from 'express';
import {
  getHealingStatus,
  requestRepair,
  approveRepair,
  reportRepairResult,
} from '../controllers/healingController.js';
import { validateAgentToken } from '../controllers/deviceController.js';

const router = Router();

router.get('/', getHealingStatus);
router.post('/request', requestRepair);
router.post('/approve', approveRepair);
// Agent-only: results arrive from the Java agent with the X-Agent-Token header.
router.post('/result', validateAgentToken, reportRepairResult);

export default router;

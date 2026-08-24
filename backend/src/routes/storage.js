import { Router } from 'express';
import { getStorageMetrics, analyzeStorage, ingestScanResult, requestScan } from '../controllers/storageController.js';
import { validateAgentToken } from '../controllers/deviceController.js';

const router = Router();

router.get('/', getStorageMetrics);
router.post('/analyze', analyzeStorage);
router.post('/request-scan', requestScan);
// Agent-only ingestion of deep scan results.
router.post('/scan-result', validateAgentToken, ingestScanResult);

export default router;

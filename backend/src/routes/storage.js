import { Router } from 'express';
import { getStorageMetrics } from '../controllers/storageController.js';

const router = Router();
router.get('/', getStorageMetrics);

export default router;

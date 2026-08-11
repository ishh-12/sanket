import { Router } from 'express';
import { getHealingStatus } from '../controllers/healingController.js';

const router = Router();
router.get('/', getHealingStatus);

export default router;

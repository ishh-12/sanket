import { Router } from 'express';
import { getDiagnosis } from '../controllers/diagnosisController.js';

const router = Router();
router.get('/', getDiagnosis);

export default router;

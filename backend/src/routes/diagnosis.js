import { Router } from 'express';
import { getDiagnosis, analyzeDiagnosis, getDiagnosisHistory } from '../controllers/diagnosisController.js';

const router = Router();

router.get('/', getDiagnosis);
router.get('/history', getDiagnosisHistory);
router.post('/analyze', analyzeDiagnosis);

export default router;

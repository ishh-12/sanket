import { Router } from 'express';
import { getPrediction, generateForecast } from '../controllers/predictionController.js';

const router = Router();

router.get('/', getPrediction);
router.post('/forecast', generateForecast);

export default router;

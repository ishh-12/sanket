import { Router } from 'express';
import deviceRoute from './device.js';
import diagnosisRoute from './diagnosis.js';
import storageRoute from './storage.js';
import healingRoute from './healing.js';
import predictionRoute from './prediction.js';

const router = Router();

router.use('/device', deviceRoute);
router.use('/diagnosis', diagnosisRoute);
router.use('/storage', storageRoute);
router.use('/healing', healingRoute);
router.use('/prediction', predictionRoute);

router.get('/', (req, res) => {
  res.json({ message: 'SANKET backend is online' });
});

export default router;

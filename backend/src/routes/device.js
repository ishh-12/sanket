import { Router } from 'express';
import { getDeviceInfo } from '../controllers/deviceController.js';

const router = Router();

router.get('/', getDeviceInfo);

export default router;

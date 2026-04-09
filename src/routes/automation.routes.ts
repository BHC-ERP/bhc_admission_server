
import { Router } from 'express';
import { toggleAutomation, getAutomationStatus, triggerManualAutomationRun } from '../controllers/admin/automation.controller';

const router = Router();

router.post('/reconcile/toggle', toggleAutomation);
router.get('/reconcile/status', getAutomationStatus);
router.post('/reconcile/trigger', triggerManualAutomationRun);

export default router;

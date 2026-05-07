import { Router } from "express";
import { 
    getSmsTemplates, 
    createSmsTemplate, 
    updateSmsTemplate, 
    deleteSmsTemplate,
    sendSms
} from "../controllers/sms.controller";

const router = Router();

router.get("/", getSmsTemplates);
router.post("/", createSmsTemplate);
router.put("/:id", updateSmsTemplate);
router.delete("/:id", deleteSmsTemplate);
router.post("/send", sendSms);

export default router;

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { myApplications, updateApplicationStatus } from "../controllers/applications.controller.js";

const router = Router();

router.get("/mine", requireAuth, requireRole("student"), myApplications);
router.patch("/:id/status", requireAuth, requireRole("employer"), updateApplicationStatus);

export default router;

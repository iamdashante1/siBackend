import { Router } from "express";
import { requireAuth, requireRole, requireActive } from "../middleware/auth.js";
import {
  createOpportunity,
  listOpportunities,
  getOpportunity,
  listMyOpportunities,
} from "../controllers/opportunities.controller.js";
import { listApplicationsForOpportunity, apply } from "../controllers/applications.controller.js";

const router = Router();

router.get("/", requireAuth, listOpportunities);
router.get("/mine", requireAuth, requireRole("employer"), listMyOpportunities);
router.get("/:id", requireAuth, getOpportunity);
router.post("/", requireAuth, requireRole("employer"), requireActive, createOpportunity);
router.post("/:id/apply", requireAuth, requireRole("student"), apply);
router.get("/:id/applications", requireAuth, requireRole("employer"), listApplicationsForOpportunity);

export default router;

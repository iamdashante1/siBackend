import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listPlacements } from "../controllers/placements.controller.js";

const router = Router();

router.get("/", requireAuth, requireRole("admin", "advisor"), listPlacements);

export default router;

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listPendingUsers,
  approveUser,
  rejectUser,
  listPendingOpportunities,
  approveOpportunity,
  rejectOpportunity,
} from "../controllers/admin.controller.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/users/pending", listPendingUsers);
router.patch("/users/:id/approve", approveUser);
router.patch("/users/:id/reject", rejectUser);
router.get("/opportunities/pending", listPendingOpportunities);
router.patch("/opportunities/:id/approve", approveOpportunity);
router.patch("/opportunities/:id/reject", rejectOpportunity);

export default router;

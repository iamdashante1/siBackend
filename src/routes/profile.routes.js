import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getProfile, updateProfile } from "../controllers/profile.controller.js";
import { uploadResume } from "../middleware/upload.js";

const router = Router();

router.get("/", requireAuth, getProfile);
router.put("/", requireAuth, uploadResume.single("resume"), updateProfile);

export default router;

import { Router } from "express";
import { register, verifyEmail, login } from "../controllers/auth.controller.js";
import { uploadResume } from "../middleware/upload.js";

const router = Router();

router.post("/register", uploadResume.single("resume"), register);
router.get("/verify/:token", verifyEmail);
router.post("/login", login);

export default router;

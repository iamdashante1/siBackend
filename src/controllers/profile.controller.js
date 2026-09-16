import StudentProfile from "../models/StudentProfile.js";
import EmployerProfile from "../models/EmployerProfile.js";

export async function getProfile(req, res) {
  if (req.user.role === "student") {
    const profile = await StudentProfile.findOne({ userId: req.user.id });
    return res.json(profile);
  }
  if (req.user.role === "employer") {
    const profile = await EmployerProfile.findOne({ userId: req.user.id });
    return res.json(profile);
  }
  return res.status(400).json({ error: "No profile for this role" });
}

export async function updateProfile(req, res) {
  if (req.user.role === "student") {
    const update = { ...req.body };
    if (req.file) update.resumeUrl = `/uploads/${req.file.filename}`;
    const profile = await StudentProfile.findOneAndUpdate({ userId: req.user.id }, update, {
      new: true,
      upsert: true,
    });
    return res.json(profile);
  }
  if (req.user.role === "employer") {
    const profile = await EmployerProfile.findOneAndUpdate({ userId: req.user.id }, req.body, {
      new: true,
      upsert: true,
    });
    return res.json(profile);
  }
  return res.status(400).json({ error: "No profile for this role" });
}

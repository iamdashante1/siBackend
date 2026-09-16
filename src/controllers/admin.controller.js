import User from "../models/User.js";
import EmployerProfile from "../models/EmployerProfile.js";
import StudentProfile from "../models/StudentProfile.js";
import Opportunity from "../models/Opportunity.js";
import { sendEmail } from "../utils/email.js";

export async function listPendingUsers(req, res) {
  const users = await User.find({ status: "pending" }).select("-passwordHash");
  return res.json(users);
}

export async function approveUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.status = "active";
  await user.save();

  if (user.role === "employer") {
    await EmployerProfile.findOneAndUpdate({ userId: user._id }, { verified: true });
  }

  await sendEmail({
    to: user.email,
    subject: "Your PlaceMe account has been approved",
    text: `Hi ${user.name}, your account is now active. You can log in and start using PlaceMe.`,
  });

  return res.json({ message: "User approved" });
}

export async function rejectUser(req, res) {
  const user = await User.findByIdAndUpdate(req.params.id, { status: "rejected" }, { new: true });
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ message: "User rejected" });
}

export async function listPendingOpportunities(req, res) {
  const opportunities = await Opportunity.find({ status: "pending" }).populate("employerId", "name email");
  return res.json(opportunities);
}

export async function approveOpportunity(req, res) {
  const opp = await Opportunity.findById(req.params.id);
  if (!opp) return res.status(404).json({ error: "Opportunity not found" });

  opp.status = "approved";
  await opp.save();

  const matching = await StudentProfile.find({ skills: { $in: opp.requiredSkills } }).populate(
    "userId",
    "email name status"
  );
  const targets = matching.length
    ? matching
    : await StudentProfile.find().populate("userId", "email name status");

  for (const profile of targets) {
    if (profile.userId?.status !== "active") continue;
    await sendEmail({
      to: profile.userId.email,
      subject: `New opportunity: ${opp.title}`,
      text: `A new opportunity "${opp.title}" was posted. Deadline: ${opp.deadline.toDateString()}.`,
    });
  }

  return res.json({ message: "Opportunity approved", notified: targets.length });
}

export async function rejectOpportunity(req, res) {
  const opp = await Opportunity.findByIdAndUpdate(req.params.id, { status: "rejected" }, { new: true });
  if (!opp) return res.status(404).json({ error: "Opportunity not found" });
  return res.json({ message: "Opportunity rejected" });
}

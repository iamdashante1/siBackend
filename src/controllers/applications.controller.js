import Application from "../models/Application.js";
import Opportunity from "../models/Opportunity.js";
import StudentProfile from "../models/StudentProfile.js";
import User from "../models/User.js";
import { sendEmail } from "../utils/email.js";

const VALID_TRANSITIONS = new Set(["shortlisted", "interview", "accepted", "rejected"]);

export async function apply(req, res) {
  const opp = await Opportunity.findById(req.params.id);
  if (!opp) return res.status(404).json({ error: "Opportunity not found" });
  if (opp.status !== "approved" || opp.deadline < new Date()) {
    return res.status(400).json({ error: "This opportunity is not open for applications" });
  }

  const already = await Application.findOne({ studentId: req.user.id, opportunityId: opp._id });
  if (already) return res.status(409).json({ error: "You already applied to this opportunity" });

  const profile = await StudentProfile.findOne({ userId: req.user.id });
  if (!profile?.resumeUrl) {
    return res.status(400).json({ error: "Complete your profile (resume) before applying" });
  }

  const application = await Application.create({
    studentId: req.user.id,
    opportunityId: opp._id,
    coverLetter: req.body.coverLetter,
    resumeUrl: profile.resumeUrl,
    status: "submitted",
    statusHistory: [{ to: "submitted", changedBy: req.user.id }],
  });

  const [student, employer] = await Promise.all([
    User.findById(req.user.id),
    User.findById(opp.employerId),
  ]);

  await sendEmail({
    to: student.email,
    subject: `Application received: ${opp.title}`,
    text: `Your application for "${opp.title}" was submitted successfully.`,
  });
  await sendEmail({
    to: employer.email,
    subject: `New application: ${opp.title}`,
    text: `${student.name} applied to your posting "${opp.title}".`,
  });

  return res.status(201).json(application);
}

export async function myApplications(req, res) {
  const applications = await Application.find({ studentId: req.user.id })
    .populate("opportunityId")
    .sort({ submittedAt: -1 });
  return res.json(applications);
}

export async function listApplicationsForOpportunity(req, res) {
  const opp = await Opportunity.findById(req.params.id);
  if (!opp) return res.status(404).json({ error: "Opportunity not found" });
  if (opp.employerId.toString() !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const applications = await Application.find({ opportunityId: opp._id })
    .populate("studentId", "name email")
    .sort({ submittedAt: -1 });
  return res.json(applications);
}

export async function updateApplicationStatus(req, res) {
  const { status, interview } = req.body;
  if (!VALID_TRANSITIONS.has(status)) {
    return res.status(400).json({ error: `status must be one of: ${[...VALID_TRANSITIONS].join(", ")}` });
  }

  const application = await Application.findById(req.params.id).populate("opportunityId");
  if (!application) return res.status(404).json({ error: "Application not found" });

  const opp = application.opportunityId;
  if (opp.employerId.toString() !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (status === "interview") {
    if (!interview?.date || new Date(interview.date) < new Date(Date.now() + 24 * 60 * 60 * 1000)) {
      return res.status(400).json({ error: "Interview date must be at least 24 hours in the future" });
    }
    application.interview = { date: interview.date, format: interview.format };
  }

  application.statusHistory.push({ from: application.status, to: status, changedBy: req.user.id });
  application.status = status;
  await application.save();

  const student = await User.findById(application.studentId);
  await sendEmail({
    to: student.email,
    subject: `Application update: ${opp.title}`,
    text: `Your application status for "${opp.title}" changed to: ${status}.`,
  });

  if (status === "accepted") {
    opp.acceptedCount += 1;
    if (opp.acceptedCount >= opp.numPositions) opp.status = "closed";
    await opp.save();
    // TODO: notify admin/advisor of placement for reporting
    console.log(`[placement] ${student.email} placed at opportunity ${opp.title}`);
  }

  return res.json(application);
}

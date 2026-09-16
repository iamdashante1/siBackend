import Opportunity from "../models/Opportunity.js";

export async function createOpportunity(req, res) {
  const { title, description, requiredSkills, duration, deadline, numPositions } = req.body;

  if (!title || !description || !deadline || !numPositions) {
    return res.status(400).json({ error: "title, description, deadline, numPositions are required" });
  }
  if (new Date(deadline) <= new Date()) {
    return res.status(400).json({ error: "deadline must be in the future" });
  }

  const opp = await Opportunity.create({
    employerId: req.user.id,
    title,
    description,
    requiredSkills: requiredSkills || [],
    duration,
    deadline,
    numPositions,
    status: "pending",
  });

  // TODO: notify admins of a new opportunity pending approval
  console.log(`[admin notify] new opportunity pending approval: ${opp.title}`);

  return res.status(201).json(opp);
}

export async function listOpportunities(req, res) {
  const opportunities = await Opportunity.find({
    status: "approved",
    deadline: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  return res.json(opportunities);
}

export async function getOpportunity(req, res) {
  const opp = await Opportunity.findById(req.params.id);
  if (!opp) return res.status(404).json({ error: "Opportunity not found" });
  return res.json(opp);
}

export async function listMyOpportunities(req, res) {
  const opportunities = await Opportunity.find({ employerId: req.user.id }).sort({ createdAt: -1 });
  return res.json(opportunities);
}

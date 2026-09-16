import Application from "../models/Application.js";

export async function listPlacements(req, res) {
  const placements = await Application.find({ status: "accepted" })
    .populate("studentId", "name email")
    .populate("opportunityId", "title employerId")
    .sort({ updatedAt: -1 });
  return res.json(placements);
}

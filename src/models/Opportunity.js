import mongoose from "mongoose";

const opportunitySchema = new mongoose.Schema(
  {
    employerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    requiredSkills: [{ type: String }],
    duration: { type: String },
    deadline: { type: Date, required: true },
    numPositions: { type: Number, required: true, min: 1 },
    acceptedCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "expired", "closed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Opportunity", opportunitySchema);

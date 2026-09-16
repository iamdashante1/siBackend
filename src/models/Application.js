import mongoose from "mongoose";

const statusHistorySchema = new mongoose.Schema(
  {
    from: { type: String },
    to: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: "Opportunity", required: true },
    coverLetter: { type: String },
    resumeUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ["submitted", "shortlisted", "interview", "accepted", "rejected"],
      default: "submitted",
    },
    interview: {
      date: { type: Date },
      format: { type: String },
    },
    submittedAt: { type: Date, default: Date.now },
    statusHistory: [statusHistorySchema],
  },
  { timestamps: true }
);

applicationSchema.index({ studentId: 1, opportunityId: 1 }, { unique: true });

export default mongoose.model("Application", applicationSchema);

import mongoose from "mongoose";

const studentProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    gpa: { type: Number },
    programme: { type: String },
    yearOfStudy: { type: Number },
    resumeUrl: { type: String },
    skills: [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model("StudentProfile", studentProfileSchema);

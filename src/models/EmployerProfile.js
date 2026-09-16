import mongoose from "mongoose";

const employerProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    companyName: { type: String, required: true },
    companyDescription: { type: String },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("EmployerProfile", employerProfileSchema);

import mongoose from 'mongoose';
import { APP_STATUS } from '../lib/constants.js';
import { cleanJson } from './_json.js';

const applicationSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    opportunity: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true },
    employer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coverLetter: { type: String, required: true },
    status: { type: String, enum: APP_STATUS, default: 'submitted' },
    appliedAt: { type: Date, default: Date.now },
    // Timeline shown to the student: [{ label, at }]
    events: [{ _id: false, label: String, at: { type: Date, default: Date.now } }],
  },
  { timestamps: true },
);
// One application per student per opportunity. (A withdrawn application is reused if they re-apply.)
applicationSchema.index({ student: 1, opportunity: 1 }, { unique: true });
cleanJson(applicationSchema);

export const Application = mongoose.model('Application', applicationSchema);

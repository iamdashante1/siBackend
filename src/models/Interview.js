import mongoose from 'mongoose';
import { INTERVIEW_STATUS, INTERVIEW_FORMATS } from '../lib/constants.js';
import { cleanJson } from './_json.js';

const interviewSchema = new mongoose.Schema(
  {
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    format: { type: String, enum: INTERVIEW_FORMATS, default: 'Video call' },
    details: { type: String, default: '' },
    status: { type: String, enum: INTERVIEW_STATUS, default: 'scheduled' },
  },
  { timestamps: true },
);
cleanJson(interviewSchema);

export const Interview = mongoose.model('Interview', interviewSchema);

import mongoose from 'mongoose';
import { OPP_STATUS, OPP_TYPES, WORK_MODES } from '../lib/constants.js';
import { cleanJson } from './_json.js';

const opportunitySchema = new mongoose.Schema(
  {
    code: { type: String, unique: true },
    employer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: OPP_TYPES, default: 'Internship' },
    field: { type: String, default: '' },
    location: { type: String, default: '' },
    workMode: { type: String, enum: WORK_MODES, default: 'Hybrid' },
    startDate: Date,
    duration: { type: String, default: '' },
    positions: { type: Number, default: 1, min: 1 },
    pay: { type: String, default: '' },
    about: { type: String, default: '' },
    responsibilities: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
    deadline: Date,
    status: { type: String, enum: OPP_STATUS, default: 'draft', index: true },
  },
  { timestamps: true },
);
cleanJson(opportunitySchema);

export const Opportunity = mongoose.model('Opportunity', opportunitySchema);

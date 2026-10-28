import mongoose from 'mongoose';
import { PLACEMENT_STATUS } from '../lib/constants.js';
import { cleanJson } from './_json.js';

const placementSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    opportunity: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true },
    // One placement per accepted application.
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, unique: true },
    status: { type: String, enum: PLACEMENT_STATUS, default: 'p_pending' },
    startDate: { type: Date, required: true },
    endDate: Date, // empty for permanent graduate jobs
    supervisor: { name: { type: String, default: '' }, email: { type: String, default: '' } },
    // Monitoring: when each stage happened, plus progress notes from the placement office.
    history: [{ _id: false, status: String, at: { type: Date, default: Date.now } }],
    notes: [{ _id: false, text: String, at: { type: Date, default: Date.now }, by: String }],
  },
  { timestamps: true },
);
cleanJson(placementSchema);

export const Placement = mongoose.model('Placement', placementSchema);

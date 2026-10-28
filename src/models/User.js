import mongoose from 'mongoose';
import { ROLES, ACCOUNT_STATUS } from '../lib/constants.js';
import { cleanJson } from './_json.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.values(ROLES), required: true },
    status: { type: String, enum: ACCOUNT_STATUS, default: 'active' },
    phone: { type: String, default: '' },
    // false until a new student/employer finishes or skips the welcome tour. Accounts created before the
    // tour existed have no value, so they never see it.
    onboarded: { type: Boolean },
    // Student-only fields
    student: {
      studentId: { type: String, default: '' },
      programme: { type: String, default: '' },
      year: { type: Number, default: 1 },
      school: { type: String, default: '' },
      skills: { type: [String], default: [] },
    },
    // Employer-only fields
    employer: {
      company: { type: String, default: '' },
      sector: { type: String, default: '' },
      city: { type: String, default: '' },
      website: { type: String, default: '' },
      address: { type: String, default: '' },
      about: { type: String, default: '' },
      contactTitle: { type: String, default: '' },
    },
    // CV (PDF) bytes are kept out of normal queries; fetched through their own route.
    cv: { type: { name: String, size: Number, data: Buffer, uploadedAt: Date }, select: false },
    cvInfo: { name: String, size: Number, uploadedAt: Date },
  },
  { timestamps: true },
);
cleanJson(userSchema);

export const User = mongoose.model('User', userSchema);

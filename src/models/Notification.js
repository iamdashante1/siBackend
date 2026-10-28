import mongoose from 'mongoose';
import { cleanJson } from './_json.js';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
cleanJson(notificationSchema);

export const Notification = mongoose.model('Notification', notificationSchema);

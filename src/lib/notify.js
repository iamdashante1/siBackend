import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { ROLES } from './constants.js';

export const notify = (user, title, body = '') => Notification.create({ user, title, body });

export async function notifyAdmins(title, body = '') {
  const admins = await User.find({ role: ROLES.ADMIN, status: 'active' }).select('_id');
  await Notification.insertMany(admins.map((a) => ({ user: a._id, title, body })));
}

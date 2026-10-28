import mongoose from 'mongoose';

// One document per prefix ("OP", "APP", "PL") so records get readable codes like APP-1001.
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model('Counter', counterSchema);

export async function nextCode(prefix) {
  const c = await Counter.findByIdAndUpdate(prefix, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `${prefix}-${1000 + c.seq}`;
}

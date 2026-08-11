import mongoose from 'mongoose';

const logEntrySchema = new mongoose.Schema({
  level: { type: String, default: 'info' },
  message: String,
  meta: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('LogEntry', logEntrySchema);

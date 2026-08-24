import mongoose from 'mongoose';

const logEntrySchema = new mongoose.Schema({
  level: { type: String, default: 'info' },
  message: String,
  meta: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});

// Index for ordered audit queries.
logEntrySchema.index({ createdAt: -1 });
// TTL: auto-delete log entries older than 30 days to prevent unbounded growth.
logEntrySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export default mongoose.model('LogEntry', logEntrySchema);

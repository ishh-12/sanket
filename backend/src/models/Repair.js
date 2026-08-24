import mongoose from 'mongoose';

const repairSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true,
  },
  repairId: { type: String, required: true },
  name: String,
  description: String,
  risk: { type: String, default: 'low' },
  status: {
    type: String,
    enum: ['requested', 'approved', 'dispatched', 'completed', 'failed'],
    default: 'requested',
  },
  requestedBy: { type: String, default: 'frontend' },
  requestedAt: { type: Date, default: Date.now },
  approvedAt: Date,
  dispatchedAt: Date,
  completedAt: Date,
  agentVersion: String,
  result: {
    success: Boolean,
    output: String,
    error: String,
    durationMs: Number,
  },
});

repairSchema.index({ deviceId: 1, status: 1 });

export default mongoose.model('Repair', repairSchema);

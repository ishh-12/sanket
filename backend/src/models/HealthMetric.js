import mongoose from 'mongoose';

const healthMetricSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
  },
  cpu: {
    usage: Number,
    temperature: Number,
  },
  memory: {
    used: Number,
    total: Number,
    usage: Number,
  },
  storage: [{
    device: String,
    used: Number,
    total: Number,
    usage: Number,
  }],
  network: {
    bytesIn: Number,
    bytesOut: Number,
    packetsIn: Number,
    packetsOut: Number,
  },
  recordedAt: { type: Date, default: Date.now },
});

// Index for efficient queries by deviceId and time
healthMetricSchema.index({ deviceId: 1, recordedAt: -1 });
// TTL: keep metrics for 30 days; historical data older than this is auto-purged.
healthMetricSchema.index({ recordedAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export default mongoose.model('HealthMetric', healthMetricSchema);

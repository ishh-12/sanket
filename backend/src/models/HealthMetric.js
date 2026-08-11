import mongoose from 'mongoose';

const healthMetricSchema = new mongoose.Schema({
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
  cpu: Number,
  memory: Number,
  storage: Number,
  network: Number,
  recordedAt: { type: Date, default: Date.now },
});

export default mongoose.model('HealthMetric', healthMetricSchema);

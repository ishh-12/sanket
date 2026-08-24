import mongoose from 'mongoose';

const diagnosisSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true,
  },
  provider: { type: String, default: null },
  model: { type: String, default: null },
  status: {
    type: String,
    enum: ['completed', 'unavailable'],
    default: 'unavailable',
  },
  reason: { type: String, default: null },
  result: { type: String, default: null },
  evidenceSummary: {
    samplesUsed: Number,
    cpuAverage: Number,
    memoryAverage: Number,
    cpuPeak: Number,
    memoryPeak: Number,
  },
  createdAt: { type: Date, default: Date.now },
});

// Index for fast history queries per device, ordered by time.
diagnosisSchema.index({ deviceId: 1, createdAt: -1 });
// TTL: auto-delete diagnosis records older than 90 days to control data growth.
diagnosisSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export default mongoose.model('Diagnosis', diagnosisSchema);

import mongoose from 'mongoose';

const storageScanSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    // unique index defined below via schema.index — do not also set index:true here
  },
  scannedAt: { type: Date, default: Date.now },
  drives: [
    {
      device: String,
      totalGB: Number,
      usableGB: Number,
      usedGB: Number,
    },
  ],
  cleanupCandidates: [
    {
      path: String,
      sizeMB: Number,
      reason: String,
    },
  ],
  largeFiles: [
    {
      path: String,
      sizeMB: Number,
      lastModified: Date,
    },
  ],
  duplicateCandidates: [
    {
      name: String,
      sizeMB: Number,
      paths: [String],
    },
  ],
  stats: {
    filesScanned: Number,
    durationMs: Number,
    truncated: Boolean,
  },
});

// Keep only the newest scan per device: unique index enables upsert-by-deviceId pattern.
storageScanSchema.index({ deviceId: 1 }, { unique: true });

export default mongoose.model('StorageScan', storageScanSchema);

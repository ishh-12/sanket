import mongoose from 'mongoose';

const deviceDNASchema = new mongoose.Schema({
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
  hash: String,
  metrics: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('DeviceDNA', deviceDNASchema);

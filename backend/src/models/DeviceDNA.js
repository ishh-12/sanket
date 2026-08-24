import mongoose from 'mongoose';

// ── stableProfile sub-document ────────────────────────────────────────────────
// NOTE: Fields named "type" inside a plain object literal are treated by Mongoose
// as SchemaType descriptors (e.g. { type: String } means "this field IS a String").
// To avoid that ambiguity, stableProfile is stored as Mixed (schema-free BSON).
// The data is validated at the controller level before storage.
// ─────────────────────────────────────────────────────────────────────────────

const deviceDNASchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    unique: true,
    sparse: true,
  },
  // Mixed: schema-free storage for hardware profile (cpu, memory, storage, network).
  // This avoids the Mongoose "type key" ambiguity for nested { type: String } fields.
  stableProfile: { type: mongoose.Schema.Types.Mixed, default: {} },
  behavioralBaseline: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, default: 'learning' },
  sampleCount: { type: Number, default: 0 },
  requiredSamples: { type: Number, default: 30 },
  baselineVersion: { type: String, default: '1.0' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model('DeviceDNA', deviceDNASchema);

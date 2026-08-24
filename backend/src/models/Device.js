import mongoose from 'mongoose';

// ── Hardware profile sub-document ─────────────────────────────────────────────
// NOTE: Mongoose treats a plain object with a "type" key as a SchemaType
// descriptor (e.g. { type: String } = "this is a String field").
// All sub-schemas that contain fields literally named "type" (memoryType,
// storageType, etc.) are stored as Mixed to avoid that ambiguity, while keeping
// the actual field name "type" in the stored BSON documents.
// ─────────────────────────────────────────────────────────────────────────────

const cpuSchema = new mongoose.Schema({
  cores: Number,
  threads: Number,
  model: String,
  speed: Number,
}, { _id: false });

const networkSchema = new mongoose.Schema({
  interfaces: Number,
  primaryInterface: String,
}, { _id: false });

// stableProfile is Mixed to avoid Mongoose "type" key ambiguity for memory.type
// and storage[].type. The agent sends these fields as plain objects; they are
// stored and returned as-is. Controller-level validation handles structure.
const deviceSchema = new mongoose.Schema({
  name: String,
  serial: String,
  // stableProfile: Mixed avoids { type: String } being misread by Mongoose.
  stableProfile: { type: mongoose.Schema.Types.Mixed, default: {} },
  agentVersion: String,
  lastSeenAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['online', 'offline'], default: 'offline' },
  scanRequested: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Sparse so null serials don't conflict; unique so re-registration finds the same device.
deviceSchema.index({ serial: 1 }, { unique: true, sparse: true });
// Efficient "latest device" query used by getDeviceInfo.
deviceSchema.index({ lastSeenAt: -1 });

export default mongoose.model('Device', deviceSchema);

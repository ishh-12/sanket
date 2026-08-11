import DeviceDNA from '../models/DeviceDNA.js';

export async function listDiagnoses() {
  return DeviceDNA.find().sort({ createdAt: -1 });
}

export async function recordDiagnosis(data) {
  return DeviceDNA.create(data);
}

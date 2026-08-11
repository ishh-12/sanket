import HealthMetric from '../models/HealthMetric.js';

export async function listHealthMetrics() {
  return HealthMetric.find().sort({ recordedAt: -1 });
}

export async function addHealthMetric(data) {
  return HealthMetric.create(data);
}

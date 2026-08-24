// Central API client — all backend communication goes through here.
// Base URL comes from the VITE_API_URL environment variable; falls back to localhost:5000.
const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || !body || body.success === false) {
    const error = new Error(body?.error || `Request failed (${response.status})`);
    error.code = body?.code || 'REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }

  return body;
}

// ── System health ─────────────────────────────────────────────────────────────

export function getHealth() {
  return request('/health');
}

// ── Device ────────────────────────────────────────────────────────────────────

export function getDevice() {
  return request('/device');
}

export function getDeviceInfo(deviceId) {
  return request(`/device/${deviceId}`);
}

export function getMetrics(deviceId, limit = 60) {
  return request(`/device/${deviceId}/metrics?limit=${limit}`);
}

// ── Predictive Health ─────────────────────────────────────────────────────────

export function getPrediction(deviceId) {
  return request(`/prediction?deviceId=${encodeURIComponent(deviceId)}`);
}

export function getForecast(deviceId, horizonHours) {
  return request('/prediction/forecast', {
    method: 'POST',
    body: JSON.stringify({ deviceId, horizonHours }),
  });
}

// ── Diagnosis ─────────────────────────────────────────────────────────────────

export function getDiagnosis(deviceId) {
  return request(`/diagnosis?deviceId=${encodeURIComponent(deviceId)}`);
}

export function getDiagnosisHistory(deviceId) {
  return request(`/diagnosis/history?deviceId=${encodeURIComponent(deviceId)}`);
}

// ── Storage ───────────────────────────────────────────────────────────────────

export function getStorageInfo(deviceId) {
  return request(`/storage?deviceId=${encodeURIComponent(deviceId)}`);
}

export function getStorageAnalysis(deviceId) {
  return request('/storage/analyze', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });
}

export function requestStorageScan(deviceId) {
  return request('/storage/request-scan', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });
}

// ── Self-healing ──────────────────────────────────────────────────────────────

export function getHealingStatus(deviceId) {
  return request(`/healing?deviceId=${encodeURIComponent(deviceId)}`);
}

export function requestRepair(deviceId, repairId) {
  return request('/healing/request', {
    method: 'POST',
    body: JSON.stringify({ deviceId, repairId }),
  });
}

/**
 * Approve a previously requested repair.
 * @param {string} deviceId  - MongoDB device ID
 * @param {string} repairId  - repair operation key (e.g. "refresh_dns_cache")
 * @param {string} [requestId] - specific Repair record _id; if omitted, most recent requested record is used
 */
export function approveRepair(deviceId, repairId, requestId) {
  return request('/healing/approve', {
    method: 'POST',
    body: JSON.stringify({ deviceId, repairId, requestId }),
  });
}

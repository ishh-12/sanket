import LogEntry from '../models/LogEntry.js';

export async function listStorageLogs() {
  return LogEntry.find().sort({ createdAt: -1 });
}

export async function addStorageLog(data) {
  return LogEntry.create(data);
}

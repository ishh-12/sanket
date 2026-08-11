import Device from '../models/Device.js';

export async function listDevices() {
  return Device.find().sort({ createdAt: -1 });
}

export async function createDevice(data) {
  return Device.create(data);
}

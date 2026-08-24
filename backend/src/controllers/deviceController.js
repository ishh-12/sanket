import Device from '../models/Device.js';
import DeviceDNA from '../models/DeviceDNA.js';
import HealthMetric from '../models/HealthMetric.js';
import mongoose from 'mongoose';
import { claimApprovedRepairs } from './healingController.js';

const isValidObjectId = (value) =>
  typeof value === 'string' && mongoose.isValidObjectId(value);

// Middleware to validate X-Agent-Token
export const validateAgentToken = (req, res, next) => {
  const token = req.headers['x-agent-token'];
  const expectedToken = process.env.AGENT_API_TOKEN;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing X-Agent-Token header', code: 'MISSING_TOKEN' });
  }

  if (token !== expectedToken) {
    return res.status(401).json({ success: false, error: 'Invalid agent token', code: 'INVALID_TOKEN' });
  }

  next();
};

// POST /api/device/register
// Register a new device or update existing
export const registerDevice = async (req, res) => {
  try {
    const { name, serial, stableProfile } = req.body;

    // Validate payload
    if (!stableProfile) {
      return res.status(400).json({ success: false, error: 'Missing stableProfile', code: 'INVALID_PAYLOAD' });
    }

    if (!stableProfile.operatingSystem || !stableProfile.architecture) {
      return res.status(400).json({ success: false, error: 'Missing operatingSystem or architecture', code: 'INVALID_PAYLOAD' });
    }

    // Try to find existing device by serial or name
    let device = null;
    if (serial) {
      device = await Device.findOne({ serial });
    }

    if (!device && name) {
      device = await Device.findOne({ name });
    }

    if (device) {
      // Update existing device
      device.name = name || device.name;
      device.serial = serial || device.serial;
      device.stableProfile = stableProfile;
      device.status = 'online';
      device.lastSeenAt = new Date();
      device.updatedAt = new Date();
      await device.save();
    } else {
      // Create new device
      device = await Device.create({
        name: name || `Device-${Date.now()}`,
        serial,
        stableProfile,
        status: 'online',
        lastSeenAt: new Date(),
      });
    }

    // Create or update DeviceDNA.
    // Use the raw MongoDB collection driver (bypassing Mongoose schema validation)
    // to handle stale documents from prior schema versions without CastErrors.
    // The old schema may have stored deviceId as a string instead of ObjectId.
    const deviceObjectId = device._id;
    const deviceIdStr = device._id.toString();

    // Search by both ObjectId and string versions to handle legacy documents.
    const rawDna = await DeviceDNA.collection.findOne({
      $or: [{ deviceId: deviceObjectId }, { deviceId: deviceIdStr }],
    });

    if (rawDna) {
      // Update stableProfile using raw driver to avoid Mongoose CastError on stale data.
      await DeviceDNA.collection.updateOne(
        { _id: rawDna._id },
        {
          $set: {
            deviceId: deviceObjectId, // normalize to ObjectId
            stableProfile,
            updatedAt: new Date(),
            baselineVersion: rawDna.baselineVersion || '1.0',
            requiredSamples: rawDna.requiredSamples || 30,
          },
        }
      );
    } else {
      // No existing DNA — create fresh via Mongoose.
      await DeviceDNA.create({
        deviceId: deviceObjectId,
        stableProfile,
        status: 'learning',
        sampleCount: 0,
        requiredSamples: 30,
        baselineVersion: '1.0',
      });
    }

    return res.status(200).json({
      success: true,
      deviceId: device._id.toString(),
      message: 'Device registered successfully',
    });
  } catch (error) {
    console.error('Error registering device:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'REGISTRATION_ERROR' });
  }
};

// POST /api/device/heartbeat
// Update device heartbeat and status
export const heartbeat = async (req, res) => {
  try {
    const { deviceId, agentVersion } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Missing deviceId', code: 'MISSING_DEVICE_ID' });
    }

    // A stale/malformed device id must be reported clearly so the agent can re-register.
    if (!isValidObjectId(deviceId)) {
      return res.status(404).json({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    // Find device
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    // Update heartbeat
    device.lastSeenAt = new Date();
    device.status = 'online';
    if (agentVersion) {
      device.agentVersion = agentVersion;
    }
    device.updatedAt = new Date();

    // Consume a pending deep-scan request (claim semantics).
    let requestedScan = false;
    if (device.scanRequested) {
      requestedScan = true;
      device.scanRequested = false;
    }

    await device.save();

    // Deliver any user-approved repairs so the agent can execute them locally.
    const pendingRepairs = await claimApprovedRepairs(device._id);

    return res.status(200).json({
      success: true,
      message: 'Heartbeat received',
      timestamp: new Date().toISOString(),
      pendingRepairs,
      requestedScan,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error processing heartbeat:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'HEARTBEAT_ERROR' });
  }
};

// POST /api/device/metrics
// Store metrics from agent
export const recordMetrics = async (req, res) => {
  try {
    const { deviceId, cpu, memory, storage, network } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Missing deviceId', code: 'MISSING_DEVICE_ID' });
    }

    if (!isValidObjectId(deviceId)) {
      return res.status(404).json({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    // Verify device exists
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    // Create health metric record
    const metric = await HealthMetric.create({
      deviceId,
      cpu,
      memory,
      storage,
      network,
      recordedAt: new Date(),
    });

    // Update DeviceDNA sample count and rolling behavioral baseline
    const dna = await DeviceDNA.findOne({ deviceId });
    if (dna) {
      dna.sampleCount = (dna.sampleCount || 0) + 1;
      if (dna.sampleCount >= dna.requiredSamples && dna.status === 'learning') {
        dna.status = 'baseline_established';
      }

      // Recompute the rolling baseline every 10 samples from real history.
      if (dna.sampleCount % 10 === 0) {
        const window = await HealthMetric.find({ deviceId })
          .sort({ recordedAt: -1 })
          .limit(50);
        const cpuValues = window.map((m) => m.cpu?.usage).filter((v) => Number.isFinite(v));
        const memValues = window.map((m) => m.memory?.usage).filter((v) => Number.isFinite(v));
        const avg = (arr) =>
          arr.length > 0
            ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
            : null;
        dna.behavioralBaseline = {
          cpuAverage: avg(cpuValues),
          memoryAverage: avg(memValues),
          cpuPeak: cpuValues.length > 0 ? Math.max(...cpuValues) : null,
          memoryPeak: memValues.length > 0 ? Math.max(...memValues) : null,
          sampleWindow: window.length,
          computedAt: new Date(),
        };
      }

      dna.updatedAt = new Date();
      await dna.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Metrics recorded',
      metricId: metric._id.toString(),
    });
  } catch (error) {
    console.error('Error recording metrics:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'METRICS_ERROR' });
  }
};

// GET /api/device
// Get device information
export const getDeviceInfo = async (req, res) => {
  try {
    // Get the most recent device (assuming single device for now)
    const device = await Device.findOne().sort({ lastSeenAt: -1 });

    if (!device) {
      return res.status(200).json({
        success: true,
        connected: false,
        device: null,
      });
    }

    // Check if device is still online (within 90 seconds)
    const staleThreshold = 90 * 1000; // 90 seconds
    const isOnline = (Date.now() - device.lastSeenAt.getTime()) < staleThreshold;

    // Get recent metrics
    const recentMetrics = await HealthMetric.findOne({ deviceId: device._id }).sort({ recordedAt: -1 });

    // Get DeviceDNA
    const dna = await DeviceDNA.findOne({ deviceId: device._id });

    return res.status(200).json({
      success: true,
      connected: isOnline,
      device: {
        _id: device._id.toString(),
        name: device.name,
        serial: device.serial,
        agentVersion: device.agentVersion,
        status: isOnline ? 'online' : 'offline',
        lastSeenAt: device.lastSeenAt,
        stableProfile: device.stableProfile,
        recentMetrics,
        dna: dna ? {
          sampleCount: dna.sampleCount,
          requiredSamples: dna.requiredSamples,
          status: dna.status,
          baselineVersion: dna.baselineVersion,
          behavioralBaseline: dna.behavioralBaseline || null,
        } : null,
      },
    });
  } catch (error) {
    console.error('Error getting device info:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'DEVICE_INFO_ERROR' });
  }
};

// GET /api/device/:deviceId
// Get specific device by ID
export const getDeviceById = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    const staleThreshold = 90 * 1000;
    const isOnline = (Date.now() - device.lastSeenAt.getTime()) < staleThreshold;

    const recentMetrics = await HealthMetric.findOne({ deviceId }).sort({ recordedAt: -1 });
    const dna = await DeviceDNA.findOne({ deviceId });

    return res.status(200).json({
      success: true,
      device: {
        _id: device._id.toString(),
        name: device.name,
        serial: device.serial,
        agentVersion: device.agentVersion,
        status: isOnline ? 'online' : 'offline',
        lastSeenAt: device.lastSeenAt,
        stableProfile: device.stableProfile,
        recentMetrics,
        dna: dna ? {
          sampleCount: dna.sampleCount,
          requiredSamples: dna.requiredSamples,
          status: dna.status,
          baselineVersion: dna.baselineVersion,
          behavioralBaseline: dna.behavioralBaseline || null,
        } : null,
      },
    });
  } catch (error) {
    console.error('Error getting device:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'DEVICE_ERROR' });
  }
};

// GET /api/device/:deviceId/metrics
// Get device metrics history
export const getDeviceMetrics = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    const metrics = await HealthMetric.find({ deviceId })
      .sort({ recordedAt: -1 })
      .limit(parseInt(limit));

    return res.status(200).json({
      success: true,
      metrics,
      count: metrics.length,
    });
  } catch (error) {
    console.error('Error getting device metrics:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'METRICS_ERROR' });
  }
};

import Device from '../models/Device.js';
import HealthMetric from '../models/HealthMetric.js';
import StorageScan from '../models/StorageScan.js';

// GET /api/storage?deviceId=...
export const getStorageMetrics = async (req, res) => {
  try {
    const { deviceId } = req.query;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing deviceId parameter',
        code: 'MISSING_DEVICE_ID',
      });
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found',
        code: 'DEVICE_NOT_FOUND',
      });
    }

    const latestMetric = await HealthMetric.findOne({ deviceId }).sort({ recordedAt: -1 });

    const storageInfo = {
      drives: device.stableProfile?.storage || [],
      metrics: latestMetric?.storage || [],
      summary: {
        totalDrives: device.stableProfile?.storage?.length || 0,
        totalCapacity: (device.stableProfile?.storage || []).reduce((sum, s) => sum + (s.capacity || 0), 0),
      },
    };

    // Real usage numbers come from agent metric samples only.
    if (latestMetric?.storage?.length > 0) {
      storageInfo.summary.totalUsed = latestMetric.storage.reduce((sum, s) => sum + (s.used || 0), 0);
      storageInfo.summary.totalFree =
        (latestMetric.storage.reduce((sum, s) => sum + (s.total || 0), 0)) -
        storageInfo.summary.totalUsed;
      storageInfo.summary.usagePercentage =
        storageInfo.summary.totalCapacity > 0
          ? Number(
              ((storageInfo.summary.totalUsed / storageInfo.summary.totalCapacity) * 100).toFixed(2)
            )
          : null;
    }

    // Latest agent deep scan, when available.
    const scan = await StorageScan.findOne({ deviceId }).sort({ scannedAt: -1 });
    storageInfo.scan = scan
      ? {
          scannedAt: scan.scannedAt,
          drives: scan.drives,
          cleanupCandidates: scan.cleanupCandidates,
          largeFiles: scan.largeFiles,
          duplicateCandidates: scan.duplicateCandidates,
          stats: scan.stats,
        }
      : null;
    storageInfo.capabilities = {
      driveUsage: true,
      largeFiles: Boolean(scan),
      duplicates: Boolean(scan),
      cleanupCandidates: Boolean(scan),
    };

    return res.status(200).json({
      success: true,
      storage: storageInfo,
    });
  } catch (error) {
    console.error('Error getting storage metrics:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'STORAGE_ERROR' });
  }
};

// POST /api/storage/analyze { deviceId }
// Drive-level health analysis from the most recent real metric sample.
export const analyzeStorage = async (req, res) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Missing deviceId', code: 'MISSING_DEVICE_ID' });
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    const latestMetric = await HealthMetric.findOne({ deviceId }).sort({ recordedAt: -1 });

    if (!latestMetric?.storage || latestMetric.storage.length === 0) {
      return res.status(200).json({
        success: true,
        analysis: {
          status: 'no_data',
          message: 'No storage metrics received from the agent yet',
        },
      });
    }

    const analysis = {
      timestamp: new Date().toISOString(),
      drives: latestMetric.storage.map((drive) => {
        const percentUsed = drive.total > 0 ? Number(((drive.used / drive.total) * 100).toFixed(2)) : 0;
        let status = 'healthy';
        if (percentUsed > 90) status = 'critical';
        else if (percentUsed > 75) status = 'warning';

        return {
          device: drive.device,
          capacity: drive.total,
          used: drive.used,
          free: drive.total - drive.used,
          usagePercentage: percentUsed,
          status,
        };
      }),
      recommendations: [],
    };

    const criticalDrives = analysis.drives.filter((d) => d.status === 'critical');
    if (criticalDrives.length > 0) {
      analysis.recommendations.push(`Critical: ${criticalDrives.length} drive(s) above 90% capacity. Free up space immediately.`);
    }

    const warningDrives = analysis.drives.filter((d) => d.status === 'warning');
    if (warningDrives.length > 0) {
      analysis.recommendations.push(`Warning: ${warningDrives.length} drive(s) above 75% capacity. Consider cleanup.`);
    }

    if (analysis.recommendations.length === 0) {
      analysis.recommendations.push('All drives have healthy space availability.');
    }

    return res.status(200).json({ success: true, analysis });
  } catch (error) {
    console.error('Error analyzing storage:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'ANALYSIS_ERROR' });
  }
};

// POST /api/storage/request-scan { deviceId }
// Queues a deep storage scan; the agent executes it locally on its next heartbeat.
export const requestScan = async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Missing deviceId', code: 'MISSING_DEVICE_ID' });
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    device.scanRequested = true;
    await device.save();

    return res.status(200).json({
      success: true,
      message: 'Deep scan requested. The agent will run it on its next heartbeat.',
      status: 'queued',
    });
  } catch (error) {
    console.error('Error requesting scan:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'SCAN_REQUEST_ERROR' });
  }
};

// POST /api/storage/scan-result { deviceId, scan { ... } }   (agent-only; token checked at route level)
export const ingestScanResult = async (req, res) => {
  try {
    const { deviceId, scan } = req.body;

    if (!deviceId || !scan) {
      return res.status(400).json({
        success: false,
        error: 'Missing deviceId or scan payload',
        code: 'MISSING_PARAMS',
      });
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    const doc = await StorageScan.findOneAndUpdate(
      { deviceId },
      {
        deviceId,
        scannedAt: new Date(),
        drives: Array.isArray(scan.drives) ? scan.drives.slice(0, 32) : [],
        cleanupCandidates: Array.isArray(scan.cleanupCandidates) ? scan.cleanupCandidates.slice(0, 100) : [],
        largeFiles: Array.isArray(scan.largeFiles) ? scan.largeFiles.slice(0, 50) : [],
        duplicateCandidates: Array.isArray(scan.duplicateCandidates) ? scan.duplicateCandidates.slice(0, 50) : [],
        stats: scan.stats || {},
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Scan stored',
      scanId: doc._id.toString(),
    });
  } catch (error) {
    console.error('Error ingesting scan result:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'SCAN_INGEST_ERROR' });
  }
};

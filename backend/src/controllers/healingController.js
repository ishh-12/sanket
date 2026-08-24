import Device from '../models/Device.js';
import Repair from '../models/Repair.js';
import LogEntry from '../models/LogEntry.js';

// Safe repair definitions. These are the ONLY operations the agent may execute,
// always behind explicit user approval.
const SAFE_REPAIRS = {
  refresh_dns_cache: {
    name: 'Refresh DNS Cache',
    description: 'Clear the Windows DNS resolver cache (ipconfig /flushdns)',
    risk: 'low',
    executionTime: '< 1 second',
  },
  clear_temp_files: {
    name: 'Clear Temporary Files',
    description: 'Delete files older than 24h from the current user temporary directory',
    risk: 'low',
    executionTime: '< 5 seconds',
  },
};

function getRepairDefinition(repairId) {
  return SAFE_REPAIRS[repairId] || null;
}

// GET /api/healing?deviceId=...
export const getHealingStatus = async (req, res) => {
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

    const history = await Repair.find({ deviceId }).sort({ requestedAt: -1 }).limit(25);

    return res.status(200).json({
      success: true,
      availableRepairs: Object.entries(SAFE_REPAIRS).map(([key, repair]) => ({
        id: key,
        ...repair,
      })),
      history: history.map((repair) => ({
        id: repair._id.toString(),
        repairId: repair.repairId,
        name: repair.name,
        risk: repair.risk,
        status: repair.status,
        requestedAt: repair.requestedAt,
        approvedAt: repair.approvedAt,
        dispatchedAt: repair.dispatchedAt,
        completedAt: repair.completedAt,
        result: repair.result || null,
      })),
    });
  } catch (error) {
    console.error('Error getting healing status:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      code: 'HEALING_ERROR',
    });
  }
};

// POST /api/healing/request { deviceId, repairId }
export const requestRepair = async (req, res) => {
  try {
    const { deviceId, repairId } = req.body;

    if (!deviceId || !repairId) {
      return res.status(400).json({
        success: false,
        error: 'Missing deviceId or repairId',
        code: 'MISSING_PARAMS',
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

    const repair = getRepairDefinition(repairId);
    if (!repair) {
      return res.status(400).json({
        success: false,
        error: 'Unknown repair operation',
        code: 'UNKNOWN_REPAIR',
      });
    }

    // Collapse duplicate pending requests for the same operation.
    const pending = await Repair.findOne({
      deviceId,
      repairId,
      status: { $in: ['requested', 'approved', 'dispatched'] },
    });
    if (pending) {
      return res.status(200).json({
        success: true,
        request: {
          requestId: pending._id.toString(),
          id: repairId,
          name: repair.name,
          risk: repair.risk,
          status: pending.status,
          message:
            pending.status === 'requested'
              ? 'Repair already requested. Awaiting user approval.'
              : `Repair already ${pending.status}.`,
        },
      });
    }

    const record = await Repair.create({
      deviceId,
      repairId,
      name: repair.name,
      description: repair.description,
      risk: repair.risk,
      status: 'requested',
    });

    await LogEntry.create({
      level: 'info',
      message: `Repair requested: ${repair.name}`,
      meta: {
        kind: 'repair_audit',
        deviceId: deviceId.toString(),
        repairRecordId: record._id.toString(),
        repairId,
        status: 'requested',
        timestamp: new Date().toISOString(),
      },
    });

    return res.status(200).json({
      success: true,
      request: {
        requestId: record._id.toString(),
        id: repairId,
        name: repair.name,
        description: repair.description,
        risk: repair.risk,
        executionTime: repair.executionTime,
        status: 'requested',
        message: 'Repair request submitted. Requires explicit user approval before execution.',
      },
    });
  } catch (error) {
    console.error('Error requesting repair:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      code: 'REQUEST_ERROR',
    });
  }
};

// POST /api/healing/approve { deviceId, repairId, requestId?, approved?: boolean }
export const approveRepair = async (req, res) => {
  try {
    const { deviceId, repairId, requestId, approved } = req.body;

    if (!deviceId || !repairId) {
      return res.status(400).json({
        success: false,
        error: 'Missing deviceId or repairId',
        code: 'MISSING_PARAMS',
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

    const repair = getRepairDefinition(repairId);
    if (!repair) {
      return res.status(400).json({
        success: false,
        error: 'Unknown repair operation',
        code: 'UNKNOWN_REPAIR',
      });
    }

    const query = { deviceId, repairId, status: 'requested' };
    if (requestId) query._id = requestId;
    const record = await Repair.findOne(query).sort({ requestedAt: -1 });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'No pending repair request found for this operation',
        code: 'NO_PENDING_REQUEST',
      });
    }

    // Explicit rejection is also recorded - nothing happens silently.
    if (approved === false) {
      record.status = 'failed';
      record.completedAt = new Date();
      record.result = { success: false, output: null, error: 'Rejected by user' };
      await record.save();

      await LogEntry.create({
        level: 'info',
        message: `Repair rejected by user: ${repair.name}`,
        meta: {
          kind: 'repair_audit',
          deviceId: deviceId.toString(),
          repairRecordId: record._id.toString(),
          repairId,
          status: 'rejected',
          timestamp: new Date().toISOString(),
        },
      });

      return res.status(200).json({
        success: true,
        approval: {
          requestId: record._id.toString(),
          id: repairId,
          name: repair.name,
          status: 'rejected',
          message: 'Repair rejected. Nothing was executed.',
        },
      });
    }

    record.status = 'approved';
    record.approvedAt = new Date();
    await record.save();

    await LogEntry.create({
      level: 'info',
      message: `Repair approved by user: ${repair.name}`,
      meta: {
        kind: 'repair_audit',
        deviceId: deviceId.toString(),
        repairRecordId: record._id.toString(),
        repairId,
        status: 'approved',
        approvedAt: new Date().toISOString(),
      },
    });

    return res.status(200).json({
      success: true,
      approval: {
        requestId: record._id.toString(),
        id: repairId,
        name: repair.name,
        risk: repair.risk,
        status: 'approved',
        message: 'Repair approved. The agent will execute it on its next heartbeat.',
      },
    });
  } catch (error) {
    console.error('Error approving repair:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      code: 'APPROVAL_ERROR',
    });
  }
};

// POST /api/healing/result  (agent-only; X-Agent-Token required at route level)
export const reportRepairResult = async (req, res) => {
  try {
    const { deviceId, repairId, success, output, error, durationMs } = req.body;

    if (!deviceId || !repairId) {
      return res.status(400).json({
        success: false,
        error: 'Missing deviceId or repairId',
        code: 'MISSING_PARAMS',
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

    const record = await Repair.findOne({ deviceId, repairId, status: 'dispatched' })
      .sort({ dispatchedAt: -1 });

    if (!record) {
      return res.status(409).json({
        success: false,
        error: 'No dispatched repair awaiting a result for this device/operation',
        code: 'NO_DISPATCHED_REPAIR',
      });
    }

    record.status = success ? 'completed' : 'failed';
    record.completedAt = new Date();
    record.result = {
      success: Boolean(success),
      output: output != null ? String(output).slice(0, 8000) : null,
      error: error != null ? String(error).slice(0, 8000) : null,
      durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : undefined,
    };
    await record.save();

    await LogEntry.create({
      level: success ? 'info' : 'error',
      message: success
        ? `Repair completed: ${record.name}`
        : `Repair failed: ${record.name}`,
      meta: {
        kind: 'repair_audit',
        deviceId: deviceId.toString(),
        repairRecordId: record._id.toString(),
        repairId,
        status: record.status,
        result: record.result,
        completedAt: new Date().toISOString(),
      },
    });

    return res.status(200).json({
      success: true,
      result: {
        requestId: record._id.toString(),
        id: repairId,
        name: record.name,
        status: record.status,
        output: record.result.output,
      },
    });
  } catch (error) {
    console.error('Error reporting repair result:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      code: 'RESULT_ERROR',
    });
  }
};

// Called by the heartbeat handler: atomically claim approved repairs for dispatch.
export async function claimApprovedRepairs(deviceId) {
  const approved = await Repair.find({ deviceId, status: 'approved' })
    .sort({ approvedAt: 1 })
    .limit(5);

  const claimed = [];
  for (const record of approved) {
    record.status = 'dispatched';
    record.dispatchedAt = new Date();
    await record.save();
    claimed.push({
      requestId: record._id.toString(),
      repairId: record.repairId,
      name: record.name,
      description: record.description,
    });
  }
  return claimed;
}

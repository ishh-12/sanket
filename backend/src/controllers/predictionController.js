import HealthMetric from '../models/HealthMetric.js';
import DeviceDNA from '../models/DeviceDNA.js';
import Device from '../models/Device.js';

const STALE_THRESHOLD_MS = 90 * 1000;

// Linear regression slope over a value series (oldest -> newest index order).
function linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  return den === 0 ? 0 : num / den;
}

function summarize(metrics) {
  const cpuValues = metrics.map((m) => m.cpu?.usage).filter((v) => Number.isFinite(v));
  const memValues = metrics.map((m) => m.memory?.usage).filter((v) => Number.isFinite(v));
  const avg = (arr) =>
    arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null;
  return {
    cpuAverage: avg(cpuValues),
    memoryAverage: avg(memValues),
    cpuPeak: cpuValues.length > 0 ? Math.max(...cpuValues) : null,
    memoryPeak: memValues.length > 0 ? Math.max(...memValues) : null,
  };
}

function classifyTrend(slope) {
  // Values are percentages; per-sample slope > 0.5 is meaningful movement.
  if (slope > 0.5) return 'increasing';
  if (slope < -0.5) return 'decreasing';
  return 'stable';
}

function detectRepeatedIssues(metrics) {
  const highCpu = metrics.filter((m) => (m.cpu?.usage ?? 0) >= 80).length;
  const highMem = metrics.filter((m) => (m.memory?.usage ?? 0) >= 85).length;
  const issues = [];
  if (highCpu >= 3) {
    issues.push({
      type: 'repeated_high_cpu',
      occurrences: highCpu,
      description: `CPU usage crossed 80% in ${highCpu} of the last ${metrics.length} samples`,
    });
  }
  if (highMem >= 3) {
    issues.push({
      type: 'repeated_high_memory',
      occurrences: highMem,
      description: `Memory usage crossed 85% in ${highMem} of the last ${metrics.length} samples`,
    });
  }
  return issues;
}

async function loadContext(deviceId) {
  const device = await Device.findById(deviceId);
  if (!device) {
    return { error: { status: 404, payload: { success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' } } };
  }
  const dna = await DeviceDNA.findOne({ deviceId });
  return { device, dna };
}

// GET /api/prediction?deviceId=...
export const getPrediction = async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing deviceId parameter',
        code: 'MISSING_DEVICE_ID',
      });
    }

    const { device, dna, error } = await loadContext(deviceId);
    if (error) return res.status(error.status).json(error.payload);

    const sampleCount = dna?.sampleCount || 0;
    const requiredSamples = dna?.requiredSamples || 30;

    const metricsNewestFirst = await HealthMetric.find({ deviceId })
      .sort({ recordedAt: -1 })
      .limit(60);

    if (!dna || sampleCount < requiredSamples || metricsNewestFirst.length < 10) {
      return res.status(200).json({
        success: true,
        prediction: {
          status: 'learning',
          available: false,
          reason: metricsNewestFirst.length < 10 ? 'insufficient_history' : 'baseline_not_ready',
          message: `Collecting baseline data. ${sampleCount} / ${requiredSamples} samples.`,
          progress: Math.min(1, sampleCount / requiredSamples),
          confidence: 0,
        },
        actual: summarize(metricsNewestFirst.slice(0, 5)),
      });
    }

    // Oldest -> newest for trend math.
    const metrics = [...metricsNewestFirst].reverse();
    const cpuSeries = metrics.map((m) => m.cpu?.usage ?? 0);
    const memSeries = metrics.map((m) => m.memory?.usage ?? 0);

    const baseline = summarize(metrics);
    const cpuSlope = linearSlope(cpuSeries);
    const memSlope = linearSlope(memSeries);
    const trend = {
      cpu: classifyTrend(cpuSlope),
      memory: classifyTrend(memSlope),
    };

    // Forecast next hour assuming ~1 metric/minute cadence.
    const horizonSamples = 60;
    const forecastCpu = Math.round(
      Math.max(0, Math.min(100, cpuSeries[cpuSeries.length - 1] + cpuSlope * horizonSamples)) * 100
    ) / 100;
    const forecastMemory = Math.round(
      Math.max(0, Math.min(100, memSeries[memSeries.length - 1] + memSlope * horizonSamples)) * 100
    ) / 100;

    const latest = metricsNewestFirst[0];
    const actual = {
      cpuUsage: latest.cpu?.usage ?? null,
      memoryUsage: latest.memory?.usage ?? null,
      recordedAt: latest.recordedAt,
      deviceOnline: device.lastSeenAt && Date.now() - device.lastSeenAt.getTime() < STALE_THRESHOLD_MS,
    };

    const repeatedIssues = detectRepeatedIssues(metricsNewestFirst);

    let status = 'healthy';
    let recommendation = 'No issues detected. All indicators within learned baseline.';
    const flags = [];

    if (forecastCpu >= 85 || forecastMemory >= 90) {
      status = 'warning';
      flags.push('forecast_critical');
      recommendation = `Forecast for the next hour reaches CPU ${forecastCpu}% / Memory ${forecastMemory}%. Consider closing heavy applications.`;
    } else if (actual.cpuUsage !== null && actual.cpuUsage >= 80 && trend.cpu !== 'decreasing') {
      status = 'caution';
      flags.push('sustained_high_cpu');
      recommendation = 'CPU usage is currently high and not clearly declining.';
    } else if (baseline.cpuAverage > 70) {
      status = 'caution';
      flags.push('elevated_cpu_baseline');
      recommendation = 'Average CPU usage over the analysis window is consistently high.';
    }

    // Elevate status when repeated issues are persistent across most of the sample window.
    // Threshold: issue occurs in ≥70% of samples → at least caution; ≥90% → warning.
    for (const issue of repeatedIssues) {
      const ratio = issue.occurrences / metricsNewestFirst.length;
      if (ratio >= 0.9) {
        if (status === 'healthy' || status === 'caution') {
          status = 'warning';
          flags.push(issue.type);
          recommendation = `Persistent issue: ${issue.description}. This has been consistently above threshold.`;
        }
      } else if (ratio >= 0.7 && status === 'healthy') {
        status = 'caution';
        flags.push(issue.type);
        recommendation = `Recurring issue: ${issue.description}. Monitor closely.`;
      }
    }

    // Confidence grows with evidence volume - no overconfident tiny-dataset claims.
    const dataConfidence = Math.min(1, metricsNewestFirst.length / requiredSamples);
    const baseConfidence =
      status === 'healthy' ? 0.8 : status === 'caution' ? 0.75 : 0.7;
    const confidence = Math.round(baseConfidence * dataConfidence * 100) / 100;

    return res.status(200).json({
      success: true,
      prediction: {
        status,
        available: true,
        message: recommendation,
        flags,
        confidence,
        trend,
        repeatedIssues,
        samplesUsed: metricsNewestFirst.length,
        nextReviewAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
      actual,
      baseline,
      forecast: {
        horizonHours: 1,
        cpuUsage: forecastCpu,
        memoryUsage: forecastMemory,
      },
    });
  } catch (error) {
    console.error('Error getting prediction:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'PREDICTION_ERROR' });
  }
};

// POST /api/prediction/forecast { deviceId, horizonHours? }
export const generateForecast = async (req, res) => {
  try {
    const { deviceId } = req.body;
    const horizonHours = Math.max(1, Math.min(72, Number(req.body.horizonHours) || 24));

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Missing deviceId', code: 'MISSING_DEVICE_ID' });
    }

    const { dna, error } = await loadContext(deviceId);
    if (error) return res.status(error.status).json(error.payload);

    const sampleCount = dna?.sampleCount || 0;
    const requiredSamples = dna?.requiredSamples || 30;

    const metricsNewestFirst = await HealthMetric.find({ deviceId })
      .sort({ recordedAt: -1 })
      .limit(120);

    if (!dna || sampleCount < requiredSamples) {
      return res.status(200).json({
        success: true,
        forecast: {
          available: false,
          reason: 'baseline_not_ready',
          message: `Baseline data collection in progress: ${sampleCount} / ${requiredSamples} samples`,
        },
      });
    }

    if (metricsNewestFirst.length < 30) {
      return res.status(200).json({
        success: true,
        forecast: {
          available: false,
          reason: 'insufficient_history',
          message: 'Insufficient historical data for a reliable forecast',
          samplesAvailable: metricsNewestFirst.length,
        },
      });
    }

    // Oldest -> newest.
    const metrics = [...metricsNewestFirst].reverse();
    const cpuSeries = metrics.map((m) => m.cpu?.usage ?? 0);
    const memSeries = metrics.map((m) => m.memory?.usage ?? 0);

    const cpuSlope = linearSlope(cpuSeries);
    const memSlope = linearSlope(memSeries);
    const clamp01pct = (v) => Math.round(Math.max(0, Math.min(100, v)) * 100) / 100;

    const lastCpu = cpuSeries[cpuSeries.length - 1];
    const lastMem = memSeries[memSeries.length - 1];

    // Build an hourly forecast path.
    const points = [];
    for (let h = 1; h <= horizonHours; h += 1) {
      points.push({
        hoursAhead: h,
        cpuUsage: clamp01pct(lastCpu + cpuSlope * 60 * h),
        memoryUsage: clamp01pct(lastMem + memSlope * 60 * h),
      });
    }

    const end = points[points.length - 1];
    const confidence = Math.round(Math.min(1, metricsNewestFirst.length / 120) * 65) / 100;

    return res.status(200).json({
      success: true,
      forecast: {
        available: true,
        horizonHours,
        unit: 'hours',
        method: 'linear_trend_extrapolation',
        predicted: {
          cpuUsage: end.cpuUsage,
          memoryUsage: end.memoryUsage,
          estimatedStatus:
            end.cpuUsage >= 85 || end.memoryUsage >= 90
              ? 'warning'
              : end.cpuUsage >= 70 || end.memoryUsage >= 80
                ? 'caution'
                : 'stable',
        },
        points,
        confidence,
        generatedAt: new Date().toISOString(),
      },
      baseline: summarize(metrics),
      trend: { cpu: classifyTrend(cpuSlope), memory: classifyTrend(memSlope) },
    });
  } catch (error) {
    console.error('Error generating forecast:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'FORECAST_ERROR' });
  }
};

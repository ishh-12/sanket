import HealthMetric from '../models/HealthMetric.js';
import Device from '../models/Device.js';
import Diagnosis from '../models/Diagnosis.js';

const UNAVAILABLE = (reason, error) => ({
  available: false,
  reason,
  error: error || undefined,
});

// ── Evidence builder ──────────────────────────────────────────────────────────

function buildEvidenceSummary(metrics) {
  const cpuValues = metrics.map((m) => m.cpu?.usage).filter((v) => Number.isFinite(v));
  const memValues = metrics.map((m) => m.memory?.usage).filter((v) => Number.isFinite(v));
  const avg = (arr) =>
    arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null;
  return {
    samplesUsed: metrics.length,
    cpuAverage: avg(cpuValues),
    memoryAverage: avg(memValues),
    cpuPeak: cpuValues.length > 0 ? Math.max(...cpuValues) : null,
    memoryPeak: memValues.length > 0 ? Math.max(...memValues) : null,
  };
}

// ── Local rule-based diagnosis ────────────────────────────────────────────────
// Always runs regardless of AI availability. Returns structured findings.

function runLocalDiagnosis(device, metrics) {
  const findings = [];
  const recommendations = [];

  const cpuValues = metrics.map((m) => m.cpu?.usage).filter((v) => Number.isFinite(v));
  const memValues = metrics.map((m) => m.memory?.usage).filter((v) => Number.isFinite(v));
  const avg = (arr) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const avgCpu = avg(cpuValues);
  const avgMem = avg(memValues);
  const peakCpu = cpuValues.length > 0 ? Math.max(...cpuValues) : null;
  const peakMem = memValues.length > 0 ? Math.max(...memValues) : null;

  // CPU thresholds
  if (avgCpu !== null && avgCpu >= 85) {
    findings.push({
      type: 'critical_cpu',
      severity: 'critical',
      message: `Average CPU usage is critically high at ${avgCpu.toFixed(1)}% across ${cpuValues.length} samples.`,
    });
    recommendations.push('Identify and close CPU-intensive processes. Check for runaway services or background updates.');
  } else if (avgCpu !== null && avgCpu >= 70) {
    findings.push({
      type: 'elevated_cpu',
      severity: 'warning',
      message: `Average CPU usage is elevated at ${avgCpu.toFixed(1)}% across ${cpuValues.length} samples.`,
    });
    recommendations.push('Monitor CPU-intensive processes. Consider restarting heavy applications.');
  }

  if (peakCpu !== null && peakCpu >= 95) {
    findings.push({
      type: 'cpu_spike',
      severity: 'warning',
      message: `CPU spiked to ${peakCpu}% in at least one recent sample.`,
    });
  }

  // Memory thresholds
  if (avgMem !== null && avgMem >= 90) {
    findings.push({
      type: 'critical_memory',
      severity: 'critical',
      message: `Average memory usage is critically high at ${avgMem.toFixed(1)}%.`,
    });
    recommendations.push('Close unused applications immediately. Consider adding RAM or adjusting virtual memory settings.');
  } else if (avgMem !== null && avgMem >= 80) {
    findings.push({
      type: 'high_memory',
      severity: 'warning',
      message: `Average memory usage is high at ${avgMem.toFixed(1)}%.`,
    });
    recommendations.push('Review memory-consuming processes. Clear temporary files and browser caches.');
  }

  if (peakMem !== null && peakMem >= 95) {
    findings.push({
      type: 'memory_pressure',
      severity: 'critical',
      message: `Memory usage peaked at ${peakMem}% — system may be under severe memory pressure.`,
    });
    recommendations.push('Restart the highest memory-consuming applications. Check for memory leaks.');
  }

  // Storage (from stableProfile or latest metric)
  const latestMetric = metrics[0];
  if (latestMetric?.storage?.length > 0) {
    for (const drive of latestMetric.storage) {
      if (Number.isFinite(drive.usage)) {
        if (drive.usage >= 95) {
          findings.push({
            type: 'critical_disk',
            severity: 'critical',
            message: `Drive ${drive.device} is at ${drive.usage}% capacity (${drive.used}/${drive.total} GB). Critically low free space.`,
          });
          recommendations.push(`Free space on drive ${drive.device} immediately. Delete temp files or move data to external storage.`);
        } else if (drive.usage >= 85) {
          findings.push({
            type: 'low_disk',
            severity: 'warning',
            message: `Drive ${drive.device} is at ${drive.usage}% capacity (${drive.used}/${drive.total} GB).`,
          });
          recommendations.push(`Clean up drive ${drive.device}: uninstall unused programs, clear Downloads folder, empty Recycle Bin.`);
        }
      }
    }
  }

  // Overall health assessment
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;

  let overallStatus = 'healthy';
  let overallMessage = 'No significant issues detected based on the available telemetry.';

  if (criticalCount > 0) {
    overallStatus = 'critical';
    overallMessage = `${criticalCount} critical issue(s) detected requiring immediate attention.`;
  } else if (warningCount > 0) {
    overallStatus = 'warning';
    overallMessage = `${warningCount} warning(s) detected. Monitor and take action as needed.`;
  }

  if (recommendations.length === 0) {
    recommendations.push('System appears to be operating within normal parameters.');
  }

  return {
    status: overallStatus,
    message: overallMessage,
    findings,
    recommendations,
    samplesAnalyzed: metrics.length,
  };
}

// Format local diagnosis as readable text for the frontend result field.
function formatLocalDiagnosisText(local) {
  const lines = [
    `OVERALL HEALTH: ${local.status.toUpperCase()}`,
    local.message,
    '',
  ];

  if (local.findings.length > 0) {
    lines.push('FINDINGS:');
    for (const f of local.findings) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.message}`);
    }
    lines.push('');
  }

  if (local.recommendations.length > 0) {
    lines.push('RECOMMENDATIONS:');
    for (const r of local.recommendations) {
      lines.push(`  • ${r}`);
    }
  }

  return lines.join('\n');
}

// ── AI prompt builder ─────────────────────────────────────────────────────────

function buildPrompt(device, evidence, localDiagnosis) {
  const profile = device.stableProfile || {};
  const lines = evidence
    .map(
      (m) =>
        `- time=${(m.recordedAt || new Date()).toISOString()} cpu=${m.cpu?.usage ?? 'n/a'}% ` +
        `memoryUsed=${m.memory?.used ?? 'n/a'}GB memoryTotal=${m.memory?.total ?? 'n/a'}GB ` +
        `memory=${m.memory?.usage ?? 'n/a'}% netIn=${m.network?.bytesIn ?? 'n/a'}B ` +
        `netOut=${m.network?.bytesOut ?? 'n/a'}B`
    )
    .join('\n');

  const storage = (profile.storage || [])
    .map((s) => `${s.device}: ${s.capacity}GB`)
    .join(', ');

  const localSummary = localDiagnosis.findings.length > 0
    ? `Rule-based pre-analysis found: ${localDiagnosis.findings.map((f) => f.message).join('; ')}`
    : 'Rule-based pre-analysis found no threshold violations.';

  return (
    'You are a precise computer health diagnostician analyzing a real Windows machine.\n' +
    'USE ONLY THE SUPPLIED EVIDENCE BELOW. Do not invent system facts.\n' +
    'If the evidence is insufficient to draw a conclusion, say so explicitly.\n\n' +
    `Device: ${device.name || 'unknown'} | OS: ${profile.operatingSystem || 'unknown'} | ` +
    `Arch: ${profile.architecture || 'unknown'}\n` +
    `CPU: ${profile.cpu?.model || 'unknown'}, ${profile.cpu?.cores || '?'} cores / ${profile.cpu?.threads || '?'} threads\n` +
    `Memory: ${profile.memory?.total || '?'} GB total (${profile.memory?.type || 'unknown type'})\n` +
    `Storage: ${storage || 'unknown'}\n\n` +
    `Recent metric samples (newest first):\n${lines}\n\n` +
    `${localSummary}\n\n` +
    'Provide a concise health assessment covering:\n' +
    '1) Overall health status\n' +
    '2) Any anomalies or concerning trends visible in the data\n' +
    '3) Likely root causes based solely on the evidence\n' +
    '4) Recommended safe actions the user can take\n\n' +
    'Be specific and concrete. Reference actual values from the evidence. ' +
    'If a value is normal, confirm that. If evidence is insufficient for any claim, say so.'
  );
}

// ── AI provider calls ─────────────────────────────────────────────────────────

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  // gemini-3.6-flash is the current stable model as of 2026.
  // Update GEMINI_MODEL in backend/.env if Google releases a newer model.
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  if (!apiKey) {
    return { ok: false, reason: 'config_missing', error: 'GEMINI_API_KEY not configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
        signal: controller.signal,
      }
    ).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      let message = `Gemini API HTTP ${response.status}`;
      let errorCode = 'provider_unavailable';
      try {
        const errBody = await response.json();
        message = errBody.error?.message || message;
        // Distinguish quota/billing from other errors.
        if (response.status === 429) errorCode = 'quota_exceeded';
        else if (response.status === 403) errorCode = 'billing_required';
        else if (response.status === 401) errorCode = 'invalid_api_key';
      } catch { /* keep default */ }
      console.error('[Diagnosis] Gemini API error:', message);
      return { ok: false, reason: errorCode, error: message };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || null;
    if (!text) {
      return { ok: false, reason: 'provider_unavailable', error: 'Empty response from Gemini' };
    }
    return { ok: true, provider: 'gemini', model, text };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { ok: false, reason: 'provider_unavailable', error: 'Gemini request timed out after 30s' };
    }
    console.error('[Diagnosis] Gemini network error:', error.message);
    return { ok: false, reason: 'provider_unavailable', error: error.message };
  }
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return { ok: false, reason: 'config_missing', error: 'OPENAI_API_KEY not configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a precise computer health diagnostician. Use only supplied evidence.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1024,
        temperature: 0.4,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      let message = `OpenAI API HTTP ${response.status}`;
      let errorCode = 'provider_unavailable';
      try {
        const errBody = await response.json();
        message = errBody.error?.message || message;
        if (response.status === 429) errorCode = 'quota_exceeded';
        else if (response.status === 401) errorCode = 'invalid_api_key';
      } catch { /* keep default */ }
      console.error('[Diagnosis] OpenAI API error:', message);
      return { ok: false, reason: errorCode, error: message };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || null;
    if (!text) {
      return { ok: false, reason: 'provider_unavailable', error: 'Empty response from OpenAI' };
    }
    return { ok: true, provider: 'openai', model, text };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { ok: false, reason: 'provider_unavailable', error: 'OpenAI request timed out after 30s' };
    }
    console.error('[Diagnosis] OpenAI network error:', error.message);
    return { ok: false, reason: 'provider_unavailable', error: error.message };
  }
}

async function runAiProvider(prompt) {
  const preferred = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

  const providers =
    preferred === 'openai'
      ? [callOpenAI, callGemini]
      : [callGemini, ...(process.env.OPENAI_API_KEY ? [callOpenAI] : [])];

  let last = null;
  for (const provider of providers) {
    const result = await provider(prompt);
    if (result.ok) return result;
    last = result;
  }

  // AI is optional — SANKET uses local diagnosis when AI is unavailable.
  return { ok: false, ...(last || {}), reason: last?.reason || 'provider_unavailable' };
}

// ── Core diagnosis function ───────────────────────────────────────────────────

async function diagnose(deviceId) {
  const device = await Device.findById(deviceId);
  if (!device) {
    return { status: 404, payload: { success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' } };
  }

  const recentMetrics = await HealthMetric.find({ deviceId })
    .sort({ recordedAt: -1 })
    .limit(20);

  // Always run local rule-based diagnosis first — it works without AI.
  const localDiagnosis = recentMetrics.length > 0
    ? runLocalDiagnosis(device, recentMetrics)
    : null;

  if (recentMetrics.length === 0) {
    const record = await Diagnosis.create({
      deviceId,
      status: 'unavailable',
      reason: 'insufficient_data',
    });
    return {
      status: 200,
      payload: {
        success: true,
        diagnosis: {
          id: record._id.toString(),
          ...UNAVAILABLE('insufficient_data'),
          message: 'No metrics available yet. Start the agent and wait for the first metric batch.',
        },
      },
    };
  }

  const evidenceSummary = buildEvidenceSummary(recentMetrics);
  const prompt = buildPrompt(device, recentMetrics, localDiagnosis);
  const aiResult = await runAiProvider(prompt);

  // Combine AI result with local diagnosis.
  // If AI is unavailable, local diagnosis text becomes the result.
  const finalText = aiResult.ok
    ? aiResult.text
    : formatLocalDiagnosisText(localDiagnosis);

  const record = await Diagnosis.create({
    deviceId,
    provider: aiResult.ok ? aiResult.provider : 'local',
    model: aiResult.ok ? aiResult.model : 'rule-based',
    status: 'completed',  // local diagnosis always completes
    reason: aiResult.ok ? null : aiResult.reason || 'provider_unavailable',
    result: finalText,
    evidenceSummary,
  });

  return {
    status: 200,
    payload: {
      success: true,
      diagnosis: {
        id: record._id.toString(),
        available: true,
        provider: aiResult.ok ? aiResult.provider : 'local',
        model: aiResult.ok ? aiResult.model : 'rule-based',
        aiAvailable: aiResult.ok,
        aiReason: aiResult.ok ? null : aiResult.reason,
        aiError: aiResult.ok ? null : (aiResult.error || null),
        result: finalText,
        localDiagnosis,
        evidenceSummary,
        timestamp: record.createdAt,
        message: aiResult.ok
          ? null
          : buildAiUnavailableMessage(aiResult.reason),
      },
    },
  };
}

function buildAiUnavailableMessage(reason) {
  const messages = {
    config_missing: 'AI provider not configured — showing local rule-based diagnosis.',
    invalid_api_key: 'AI API key is invalid — showing local rule-based diagnosis.',
    quota_exceeded: 'AI quota exceeded — showing local rule-based diagnosis.',
    billing_required: 'AI billing not enabled — showing local rule-based diagnosis.',
    provider_unavailable: 'AI provider unavailable — showing local rule-based diagnosis.',
  };
  return messages[reason] || 'AI unavailable — showing local rule-based diagnosis.';
}

// ── Route handlers ────────────────────────────────────────────────────────────

// GET /api/diagnosis?deviceId=...
export const getDiagnosis = async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing deviceId parameter',
        code: 'MISSING_DEVICE_ID',
      });
    }
    const { status, payload } = await diagnose(deviceId);
    return res.status(status).json(payload);
  } catch (error) {
    console.error('[Diagnosis] Error getting diagnosis:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'DIAGNOSIS_ERROR' });
  }
};

// POST /api/diagnosis/analyze { deviceId }
export const analyzeDiagnosis = async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Missing deviceId', code: 'MISSING_DEVICE_ID' });
    }
    const { status, payload } = await diagnose(deviceId);
    return res.status(status).json(payload);
  } catch (error) {
    console.error('[Diagnosis] Error analyzing diagnosis:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'ANALYSIS_ERROR' });
  }
};

// GET /api/diagnosis/history?deviceId=...
export const getDiagnosisHistory = async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing deviceId parameter',
        code: 'MISSING_DEVICE_ID',
      });
    }

    const history = await Diagnosis.find({ deviceId }).sort({ createdAt: -1 }).limit(25);

    return res.status(200).json({
      success: true,
      history: history.map((d) => ({
        id: d._id.toString(),
        provider: d.provider,
        model: d.model,
        status: d.status,
        reason: d.reason,
        result: d.result,
        evidenceSummary: d.evidenceSummary,
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Diagnosis] Error getting diagnosis history:', error);
    return res.status(500).json({ success: false, error: error.message, code: 'HISTORY_ERROR' });
  }
};

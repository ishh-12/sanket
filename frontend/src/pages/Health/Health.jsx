import Navbar from '../../components/Navbar/Navbar';
import useDevice from '../../hooks/useDevice';
import { getPrediction, getForecast } from '../../api/client';
import { useCallback, useEffect, useState } from 'react';

export default function Health() {
  const { device, connected } = useDevice(0);
  const [prediction, setPrediction] = useState(null);
  const [extras, setExtras] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async (deviceId) => {
    try {
      const data = await getPrediction(deviceId);
      setPrediction(data.prediction);
      setExtras({ actual: data.actual, baseline: data.baseline, forecast: data.forecast });
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (device?._id) load(device._id);
  }, [device?._id, load]);

  const runForecast = async () => {
    if (!device?._id) return;
    try {
      const data = await getForecast(device._id, 24);
      setForecast(data.forecast);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!device) {
    return (
      <div className="page-shell">
        <Navbar />
        <main className="page-content">
          <h1>Predictive Health</h1>
          <div className="empty-state">
            <strong>No Device Registered</strong>
            <p>Predictions require real historical samples from the agent.</p>
          </div>
        </main>
      </div>
    );
  }

  const statusColor =
    prediction?.status === 'healthy' ? 'sage'
      : prediction?.status === 'warning' ? 'warning'
        : prediction?.status === 'caution' ? 'amber'
          : '';

  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-content">
        <h1>Predictive Health</h1>
        <p>
          SANKET compares live values against the learned Device DNA baseline and
          extrapolates recent trends. Predictions only appear once enough real samples
          exist.
        </p>

        {error && <div className="error-banner">{error}</div>}

        <div className="panel-grid">
          <section className="panel">
            <h3><span className={`dot ${connected ? '' : 'offline'}`} />Prediction</h3>
            {prediction ? (
              <>
                <div className="kv">
                  <span>Status</span>
                  <span className={`status-pill ${statusColor}`}>{prediction.status.replace('_', ' ')}</span>
                </div>
                <p style={{ margin: '0.9rem 0' }}>{prediction.message}</p>
                <div className="kv"><span>Confidence</span><span>{Math.round((prediction.confidence || 0) * 100)}%</span></div>
                {prediction.trend && (
                  <div className="kv"><span>Trend CPU / Mem</span><span>{prediction.trend.cpu} / {prediction.trend.memory}</span></div>
                )}
                {Number.isFinite(prediction.progress) && (
                  <>
                    <div className="kv"><span>Baseline progress</span><span>{Math.round(prediction.progress * 100)}%</span></div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${prediction.progress * 100}%` }} /></div>
                  </>
                )}
              </>
            ) : (
              <p>Loading…</p>
            )}
          </section>

          {extras?.actual && (
            <section className="panel">
              <h3><span className="dot" />Actual (latest sample)</h3>
              <div className="kv"><span>CPU usage</span><span>{extras.actual.cpuUsage ?? '—'}%</span></div>
              <div className="kv"><span>Memory usage</span><span>{extras.actual.memoryUsage ?? '—'}%</span></div>
              <div className="kv"><span>Recorded at</span><span>{new Date(extras.actual.recordedAt).toLocaleTimeString()}</span></div>
            </section>
          )}

          {extras?.baseline && (
            <section className="panel">
              <h3><span className="dot sage" />Baseline (analysis window)</h3>
              <div className="kv"><span>CPU avg / peak</span><span>{extras.baseline.cpuAverage ?? '—'}% / {extras.baseline.cpuPeak ?? '—'}%</span></div>
              <div className="kv"><span>Memory avg / peak</span><span>{extras.baseline.memoryAverage ?? '—'}% / {extras.baseline.memoryPeak ?? '—'}%</span></div>
            </section>
          )}

          {extras?.forecast && (
            <section className="panel">
              <h3><span className="dot" />Forecast (next hour)</h3>
              <div className="big-metric">{extras.forecast.cpuUsage}<small>% CPU</small></div>
              <div style={{ height: '0.5rem' }} />
              <div className="big-metric" style={{ color: 'var(--sage)' }}>{extras.forecast.memoryUsage}<small>% MEM</small></div>
            </section>
          )}

          {(prediction?.repeatedIssues?.length > 0) && (
            <section className="panel">
              <h3><span className="dot offline" />Repeated Issues Detected</h3>
              {prediction.repeatedIssues.map((issue) => (
                <div className="kv" key={issue.type}>
                  <span>{issue.type.replace(/_/g, ' ')}</span>
                  <span>{issue.description}</span>
                </div>
              ))}
            </section>
          )}
        </div>

        <button className="run-btn" style={{ marginTop: '2.5rem' }} onClick={runForecast}>
          GENERATE 24H FORECAST
        </button>

        {forecast && !forecast.available && (
          <div className="empty-state" style={{ marginTop: '1.5rem' }}>
            <strong>Forecast Unavailable</strong>
            <p>{forecast.message} ({forecast.reason})</p>
          </div>
        )}

        {forecast?.available && (
          <section className="panel" style={{ marginTop: '1.5rem' }}>
            <h3>
              <span className="dot" />24-Hour Forecast
              <span className="status-pill">confidence {Math.round(forecast.confidence * 100)}%</span>
            </h3>
            <div className="kv"><span>Method</span><span>{forecast.method}</span></div>
            <div className="kv"><span>CPU in {forecast.horizonHours}h</span><span>{forecast.predicted.cpuUsage}% ({forecast.predicted.estimatedStatus})</span></div>
            <div className="kv"><span>Memory in {forecast.horizonHours}h</span><span>{forecast.predicted.memoryUsage}%</span></div>
          </section>
        )}
      </main>
    </div>
  );
}

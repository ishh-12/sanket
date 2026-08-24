import Navbar from '../../components/Navbar/Navbar';
import useDevice from '../../hooks/useDevice';
import { getMetrics } from '../../api/client';
import { useEffect, useState } from 'react';
import './Dashboard.css';

function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes)) || bytes === null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export default function Dashboard() {
  const { device, connected, loading, error } = useDevice(10000);
  const [metrics, setMetrics] = useState([]);

  useEffect(() => {
    if (!device?._id) return undefined;
    let active = true;
    const load = () => {
      getMetrics(device._id, 40)
        .then((data) => {
          if (active) setMetrics(data.metrics || []);
        })
        .catch(() => { });
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [device?._id]);

  if (loading) {
    return (
      <div className="page-shell">
        <Navbar />
        <main className="page-content">
          <h1>Dashboard</h1>
          <p>Connecting to SANKET backend…</p>
        </main>
      </div>
    );
  }

  // Backend is reachable but returned an error (e.g. DB down)
  if (!loading && error && !device) {
    return (
      <div className="page-shell">
        <Navbar />
        <main className="page-content">
          <h1>Dashboard</h1>
          <div className="error-banner">
            <strong>Backend unavailable</strong> — {error}
          </div>
          <p style={{ marginTop: '1rem', color: 'var(--soft)', fontSize: '0.9rem' }}>
            Verify the backend is running on port 5000 and MongoDB is connected.
          </p>
        </main>
      </div>
    );
  }

  const latest = metrics[0] || null;
  const cpu = latest?.cpu?.usage;
  const memoryUsage = latest?.memory?.usage;
  const profile = device?.stableProfile;

  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-content">
        <h1>Dashboard</h1>

        {!device && (
          <div className="empty-state">
            <strong>No Device Registered</strong>
            <p>
              The SANKET agent has not registered yet. Start the Java agent on this
              machine — it will appear here automatically.
            </p>
          </div>
        )}

        {device && (
          <>
            {error && <div className="error-banner">{error}</div>}

            <div className="panel-grid">
              <section className="panel">
                <h3><span className={`dot ${connected ? '' : 'offline'}`} />Connection</h3>
                <div className="kv"><span>Agent</span><span>{connected ? 'Connected' : 'Offline'}</span></div>
                <div className="kv"><span>Device ID</span><span className="mono">{device._id}</span></div>
                <div className="kv"><span>Last seen</span><span>{new Date(device.lastSeenAt).toLocaleTimeString()}</span></div>
                <div className="kv"><span>Agent version</span><span>{device.agentVersion || '—'}</span></div>
              </section>

              <section className="panel">
                <h3><span className="dot" />System Identity</h3>
                <div className="kv"><span>Hostname</span><span>{device.name || '—'}</span></div>
                <div className="kv"><span>OS</span><span>{profile?.operatingSystem || '—'}</span></div>
                <div className="kv"><span>Architecture</span><span>{profile?.architecture || '—'}</span></div>
                <div className="kv">
                  <span>CPU model</span>
                  <span>{profile?.cpu?.model || '—'}</span>
                </div>
                <div className="kv">
                  <span>CPU cores</span>
                  <span>{profile?.cpu?.cores ?? '—'} cores / {profile?.cpu?.threads ?? '—'} threads</span>
                </div>
                <div className="kv">
                  <span>Memory</span>
                  <span>{profile?.memory ? `${profile.memory.total} GB ${profile.memory.type}` : '—'}</span>
                </div>
                <div className="kv">
                  <span>Network</span>
                  <span>{profile?.network?.primaryInterface || '—'} ({profile?.network?.interfaces ?? 0} interfaces)</span>
                </div>
              </section>

              <section className="panel">
                <h3><span className={`dot ${connected ? '' : 'offline'}`} />Live Metrics</h3>
                {latest ? (
                  <>
                    <div className="metric-row">
                      <div>
                        <div className="big-metric">{cpu ?? '—'}<small>% CPU</small></div>
                      </div>
                      <div>
                        <div className="big-metric">{memoryUsage ?? '—'}<small>% MEM</small></div>
                      </div>
                    </div>
                    <div className="bar-track">
                      <div className={`bar-fill ${(cpu > 80 || memoryUsage > 85) ? 'warn' : ''}`}
                        style={{ width: `${Math.max(cpu || 0, memoryUsage || 0)}%` }} />
                    </div>
                    <div style={{ height: '0.8rem' }} />
                    <div className="kv"><span>Memory used</span><span>{latest.memory?.used ?? '—'} / {latest.memory?.total ?? '—'} GB</span></div>
                    {(latest.storage || []).map((drive) => (
                      <div className="kv" key={drive.device}>
                        <span>Drive {drive.device}</span>
                        <span>{drive.used} / {drive.total} GB ({drive.usage}%)</span>
                      </div>
                    ))}
                    <div className="kv"><span>Net in / out</span>
                      <span>{formatBytes(latest.network?.bytesIn)} / {formatBytes(latest.network?.bytesOut)}</span></div>
                    <div className="kv"><span>Sample time</span><span>{new Date(latest.recordedAt).toLocaleTimeString()}</span></div>
                  </>
                ) : (
                  <p>No metric samples received yet. The agent sends metrics periodically.</p>
                )}
              </section>

              <section className="panel">
                <h3><span className={device.dna ? 'dot' : 'dot offline'} />Device DNA</h3>
                {device.dna ? (
                  <>
                    <div className="kv">
                      <span>Status</span>
                      <span className={`status-pill ${device.dna.status === 'baseline_established' ? 'sage' : 'amber'}`}>
                        {device.dna.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="kv"><span>Samples collected</span><span>{device.dna.sampleCount} / {device.dna.requiredSamples}</span></div>
                    {device.dna.status !== 'baseline_established' && (
                      <>
                        <div className="bar-track">
                          <div className="bar-fill"
                            style={{ width: `${Math.min(100, (device.dna.sampleCount / Math.max(1, device.dna.requiredSamples)) * 100)}%` }} />
                        </div>
                        <div style={{ height: '0.8rem' }} />
                      </>
                    )}
                    {device.dna.status === 'baseline_established' && device.dna.behavioralBaseline && (
                      <>
                        <div style={{ height: '0.5rem' }} />
                        <div className="kv"><span>Baseline CPU avg</span><span>{device.dna.behavioralBaseline.cpuAverage ?? '—'}%</span></div>
                        <div className="kv"><span>Baseline CPU peak</span><span>{device.dna.behavioralBaseline.cpuPeak ?? '—'}%</span></div>
                        <div className="kv"><span>Baseline mem avg</span><span>{device.dna.behavioralBaseline.memoryAverage ?? '—'}%</span></div>
                        <div className="kv"><span>Baseline mem peak</span><span>{device.dna.behavioralBaseline.memoryPeak ?? '—'}%</span></div>
                        {latest && (
                          <>
                            <div style={{ height: '0.5rem', borderTop: '1px dashed rgba(242,240,232,0.08)', marginTop: '0.6rem' }} />
                            <div className="kv" style={{ paddingTop: '0.6rem' }}>
                              <span>Current vs baseline CPU</span>
                              <span style={{ color: (cpu ?? 0) > (device.dna.behavioralBaseline.cpuAverage + 15) ? 'var(--amber)' : 'var(--sage)' }}>
                                {cpu ?? '—'}% {cpu !== null && device.dna.behavioralBaseline.cpuAverage !== null
                                  ? (cpu > device.dna.behavioralBaseline.cpuAverage ? `▲ +${(cpu - device.dna.behavioralBaseline.cpuAverage).toFixed(1)}%` : `▼ ${(cpu - device.dna.behavioralBaseline.cpuAverage).toFixed(1)}%`)
                                  : ''}
                              </span>
                            </div>
                            <div className="kv">
                              <span>Current vs baseline mem</span>
                              <span style={{ color: (memoryUsage ?? 0) > (device.dna.behavioralBaseline.memoryAverage + 10) ? 'var(--amber)' : 'var(--sage)' }}>
                                {memoryUsage ?? '—'}% {memoryUsage !== null && device.dna.behavioralBaseline.memoryAverage !== null
                                  ? (memoryUsage > device.dna.behavioralBaseline.memoryAverage ? `▲ +${(memoryUsage - device.dna.behavioralBaseline.memoryAverage).toFixed(1)}%` : `▼ ${(memoryUsage - device.dna.behavioralBaseline.memoryAverage).toFixed(1)}%`)
                                  : ''}
                              </span>
                            </div>
                          </>
                        )}
                      </>
                    )}
                    <div className="kv"><span>Baseline version</span><span>v{device.dna.baselineVersion}</span></div>
                  </>
                ) : (
                  <p>Device DNA record not initialized yet.</p>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

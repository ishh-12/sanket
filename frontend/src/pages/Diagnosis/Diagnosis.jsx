import Navbar from '../../components/Navbar/Navbar';
import useDevice from '../../hooks/useDevice';
import { getDiagnosis, getDiagnosisHistory } from '../../api/client';
import { useCallback, useEffect, useState } from 'react';

const SEVERITY_CLASS = { critical: 'amber', warning: 'amber', info: '' };

export default function Diagnosis() {
  const { device } = useDevice(0);
  const [diagnosis, setDiagnosis] = useState(null);
  const [history, setHistory] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const loadHistory = useCallback(async (deviceId) => {
    try {
      const data = await getDiagnosisHistory(deviceId);
      setHistory(data.history || []);
    } catch {
      /* history is supplemental */
    }
  }, []);

  useEffect(() => {
    if (device?._id) loadHistory(device._id);
  }, [device?._id, loadHistory]);

  const runDiagnosis = async () => {
    if (!device?._id || running) return;
    setRunning(true);
    setError(null);
    setDiagnosis(null);
    try {
      const data = await getDiagnosis(device._id);
      setDiagnosis(data.diagnosis);
      await loadHistory(device._id);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const local = diagnosis?.localDiagnosis;

  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-content">
        <h1>AI Diagnosis</h1>
        <p>
          SANKET always runs deterministic local diagnostics from real telemetry. When an
          AI provider is configured it enhances the analysis with contextual reasoning.
          All diagnoses are based solely on evidence collected from this machine.
        </p>

        {!device && (
          <div className="empty-state">
            <strong>No Device Registered</strong>
            <p>Start the agent first. Diagnosis runs on real collected evidence.</p>
          </div>
        )}

        {device && (
          <>
            <button className="run-btn" onClick={runDiagnosis} disabled={running}>
              {running ? 'ANALYZING…' : 'RUN DIAGNOSIS'}
            </button>

            {error && <div className="error-banner">{error}</div>}

            {/* Local rule-based findings — always shown when present */}
            {local && (
              <section className="panel" style={{ marginTop: '1.5rem' }}>
                <h3>
                  <span className={`dot ${local.status === 'healthy' ? 'sage' : 'offline'}`} />
                  Local Analysis
                  <span className={`status-pill ${local.status === 'healthy' ? 'sage' : 'amber'}`}>
                    {local.status}
                  </span>
                </h3>
                <p style={{ margin: '0 0 0.6rem' }}>{local.message}</p>

                {local.findings?.length > 0 && (
                  <div style={{ marginBottom: '0.8rem' }}>
                    {local.findings.map((f, i) => (
                      <div className="kv" key={i}>
                        <span className={`status-pill ${SEVERITY_CLASS[f.severity] || ''}`}>
                          {f.severity}
                        </span>
                        <span style={{ fontSize: '0.82rem' }}>{f.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {local.recommendations?.length > 0 && (
                  <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem', fontSize: '0.84rem', lineHeight: 1.7 }}>
                    {local.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}

                <div className="kv" style={{ marginTop: '0.8rem' }}>
                  <span>Samples analysed</span>
                  <span>{local.samplesAnalyzed}</span>
                </div>
              </section>
            )}

            {/* AI unavailability notice */}
            {diagnosis && !diagnosis.aiAvailable && diagnosis.message && (
              <div className="panel" style={{ marginTop: '1rem', borderColor: 'rgba(242,179,0,0.3)' }}>
                <h3><span className="dot offline" />AI Notice</h3>
                <p style={{ margin: 0, fontSize: '0.87rem' }}>
                  {diagnosis.message}
                  {diagnosis.aiError ? <><br /><span style={{ color: 'var(--soft)' }}>{diagnosis.aiError}</span></> : null}
                </p>
              </div>
            )}

            {/* AI-enhanced result */}
            {diagnosis?.available && diagnosis.aiAvailable && (
              <section className="panel diagnosis-result" style={{ marginTop: '1rem' }}>
                <h3>
                  <span className="dot" />AI-Enhanced Result
                  <span className="status-pill">{diagnosis.provider} · {diagnosis.model}</span>
                </h3>
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{diagnosis.result}</p>
                {diagnosis.evidenceSummary && (
                  <>
                    <div style={{ height: '0.6rem' }} />
                    <div className="kv"><span>Evidence samples</span><span>{diagnosis.evidenceSummary.samplesUsed}</span></div>
                    <div className="kv"><span>CPU avg / peak</span><span>{diagnosis.evidenceSummary.cpuAverage ?? '—'}% / {diagnosis.evidenceSummary.cpuPeak ?? '—'}%</span></div>
                    <div className="kv"><span>Memory avg / peak</span><span>{diagnosis.evidenceSummary.memoryAverage ?? '—'}% / {diagnosis.evidenceSummary.memoryPeak ?? '—'}%</span></div>
                  </>
                )}
              </section>
            )}

            <h2 style={{ marginTop: '3rem', fontSize: '1.1rem', letterSpacing: '0.16em' }}>DIAGNOSIS HISTORY</h2>
            <div className="history-list">
              {history.length === 0 && <p>No diagnoses recorded yet.</p>}
              {history.map((entry) => (
                <article className="panel history-item" key={entry.id}>
                  <div className="kv"><span>Date</span><span>{new Date(entry.createdAt).toLocaleString()}</span></div>
                  <div className="kv">
                    <span>Engine</span>
                    <span>
                      {entry.provider === 'local'
                        ? 'Local (rule-based)'
                        : entry.provider
                          ? `${entry.provider} (${entry.model})`
                          : 'Unknown'}
                    </span>
                  </div>
                  <div className="kv">
                    <span>Status</span>
                    <span>{entry.status === 'completed' ? 'Completed' : `Unavailable (${entry.reason})`}</span>
                  </div>
                  {entry.result && (
                    <p style={{
                      margin: '0.8rem 0 0',
                      fontSize: '0.85rem',
                      color: 'rgba(242,240,232,0.72)',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>{entry.result}</p>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

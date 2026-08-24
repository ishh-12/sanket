import Navbar from '../../components/Navbar/Navbar';
import useDevice from '../../hooks/useDevice';
import { getHealingStatus, requestRepair, approveRepair } from '../../api/client';
import { useCallback, useEffect, useState } from 'react';

const STATUS_LABELS = {
  requested: { label: 'Awaiting your approval', cls: 'amber' },
  approved: { label: 'Approved — waiting for agent', cls: 'sage' },
  dispatched: { label: 'Agent executing', cls: 'sage' },
  completed: { label: 'Completed', cls: '' },
  failed: { label: 'Failed / rejected', cls: 'amber' },
};

export default function Healing() {
  const { device, connected } = useDevice(10000);
  const [repairs, setRepairs] = useState([]);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async (deviceId) => {
    try {
      const data = await getHealingStatus(deviceId);
      setRepairs(data.availableRepairs || []);
      setHistory(data.history || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (device?._id) load(device._id);
  }, [device?._id, load]);

  const startFlow = async (repairId) => {
    if (!device?._id || busy) return;
    setBusy(repairId);
    setNotice(null);
    setError(null);
    try {
      // Step 1: request the repair — get back the specific requestId
      const requestData = await requestRepair(device._id, repairId);
      const requestId = requestData.request?.requestId;

      // Step 2: approve using the exact requestId so we target the right record
      await approveRepair(device._id, repairId, requestId);

      setNotice(
        `"${repairs.find((r) => r.id === repairId)?.name}" approved. The agent will execute it on its next heartbeat (≤30 s).`
      );
      await load(device._id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-content">
        <h1>Safe Self-Healing</h1>
        <p>
          SANKET diagnoses issues, validates safety, and waits for your approval before
          executing anything. Every step is audited. Nothing runs on this machine without
          your explicit confirmation.
        </p>

        {!device && (
          <div className="empty-state">
            <strong>No Device Registered</strong>
            <p>Repairs are executed locally by the SANKET agent. Start the agent first.</p>
          </div>
        )}

        {device && (
          <>
            <div className="kv" style={{ maxWidth: '26rem', marginTop: '1.5rem' }}>
              <span>Agent</span>
              <span>
                {connected
                  ? 'Connected — ready to receive approved repairs'
                  : 'Offline — approvals will execute when agent reconnects'}
              </span>
            </div>

            <div className="health-count-flow">
              <span>DIAGNOSE</span>
              <span>SAFETY CHECK</span>
              <span>APPROVE</span>
              <span>REPAIR</span>
              <span>VERIFY</span>
            </div>

            {notice && (
              <div style={{
                border: '1px solid rgba(199,255,61,0.4)', borderRadius: 12,
                background: 'rgba(199,255,61,0.06)', color: 'var(--lime)',
                padding: '0.9rem 1.2rem', marginTop: '1.5rem', fontSize: '0.88rem',
              }}>{notice}</div>
            )}

            {error && <div className="error-banner">{error}</div>}

            <div className="panel-grid">
              {repairs.map((repair) => (
                <section className="panel" key={repair.id}>
                  <h3>
                    <span className={repair.risk === 'low' ? 'dot sage' : 'dot'} />
                    {repair.name}
                    <span className={`status-pill ${repair.risk === 'low' ? 'sage' : ''}`}>
                      risk: {repair.risk}
                    </span>
                  </h3>
                  <p style={{ margin: '0 0 0.8rem' }}>{repair.description}</p>
                  <div className="kv"><span>Typical time</span><span>{repair.executionTime}</span></div>
                  <button
                    className="run-btn"
                    style={{ marginTop: '1.1rem', padding: '0.65rem 1.5rem', fontSize: '0.7rem' }}
                    onClick={() => startFlow(repair.id)}
                    disabled={!!busy}
                  >
                    {busy === repair.id ? 'APPROVING…' : 'REQUEST & APPROVE'}
                  </button>
                  <p style={{ fontSize: '0.72rem', color: 'var(--soft)', marginTop: '0.6rem' }}>
                    Your click is recorded as explicit approval in the audit log.
                  </p>
                </section>
              ))}
            </div>

            <h2 style={{ marginTop: '3rem', fontSize: '1.1rem', letterSpacing: '0.16em' }}>
              REPAIR HISTORY &amp; AUDIT
            </h2>
            <div className="history-list">
              {history.length === 0 && <p>No repair activity recorded yet.</p>}
              {history.map((entry) => {
                const statusInfo = STATUS_LABELS[entry.status] || { label: entry.status, cls: '' };
                return (
                  <article className="panel history-item" key={entry.id}>
                    <div className="kv">
                      <span>{entry.name || entry.repairId}</span>
                      <span className={`status-pill ${statusInfo.cls}`}>{statusInfo.label}</span>
                    </div>
                    <div className="kv">
                      <span>Requested</span>
                      <span>{new Date(entry.requestedAt).toLocaleString()}</span>
                    </div>
                    {entry.approvedAt && (
                      <div className="kv">
                        <span>Approved by user</span>
                        <span>{new Date(entry.approvedAt).toLocaleTimeString()}</span>
                      </div>
                    )}
                    {entry.completedAt && (
                      <div className="kv">
                        <span>Completed</span>
                        <span>{new Date(entry.completedAt).toLocaleTimeString()}</span>
                      </div>
                    )}
                    {entry.result?.output && (
                      <div className="kv">
                        <span>Output</span>
                        <span style={{ fontSize: '0.75rem' }}>
                          {String(entry.result.output).slice(0, 220)}
                        </span>
                      </div>
                    )}
                    {entry.result?.error && (
                      <div className="kv">
                        <span>Error</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--amber)' }}>
                          {String(entry.result.error).slice(0, 220)}
                        </span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

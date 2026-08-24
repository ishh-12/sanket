import Navbar from '../../components/Navbar/Navbar';
import useDevice from '../../hooks/useDevice';
import { getStorageInfo, requestStorageScan } from '../../api/client';
import { useCallback, useEffect, useState } from 'react';

export default function Storage() {
  const { device } = useDevice(0);
  const [storage, setStorage] = useState(null);
  const [scanQueued, setScanQueued] = useState(false);
  const [error, setError] = useState(null);

  const loadStorage = useCallback(async (deviceId) => {
    try {
      const data = await getStorageInfo(deviceId);
      setStorage(data.storage);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (device?._id) loadStorage(device._id);
  }, [device?._id, loadStorage]);

  const queueScan = async () => {
    if (!device?._id) return;
    try {
      await requestStorageScan(device._id);
      setScanQueued(true);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!device) {
    return (
      <div className="page-shell">
        <Navbar />
        <main className="page-content">
          <h1>Storage Intelligence</h1>
          <div className="empty-state">
            <strong>No Device Registered</strong>
            <p>Start the agent to collect real storage data.</p>
          </div>
        </main>
      </div>
    );
  }

  const drives = storage?.metrics?.length > 0
    ? storage.metrics
    : (storage?.drives || []).map((d) => ({
        device: d.device,
        total: d.capacity,
        used: null,
        usage: null,
      }));
  const scan = storage?.scan;

  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-content">
        <h1>Storage Intelligence</h1>
        <p>All values come directly from the SANKET agent on this machine.</p>

        {error && <div className="error-banner">{error}</div>}

        {drives.length === 0 ? (
          <div className="empty-state">
            <strong>No Storage Data Yet</strong>
            <p>The agent has not reported drive information.</p>
          </div>
        ) : (
          <section className="panel" style={{ marginTop: '2rem' }}>
            <h3><span className="dot" />Drives</h3>
            {drives.map((drive) => (
              <div key={drive.device} style={{ marginBottom: '1.1rem' }}>
                <div className="kv">
                  <span>{drive.device}</span>
                  <span>
                    {drive.used != null
                      ? `${drive.used} GB used of ${drive.total} GB`
                      : `Capacity ${drive.total} GB`}
                    {drive.usage != null ? ` · ${drive.usage}%` : ''}
                  </span>
                </div>
                {drive.usage != null && (
                  <div className="bar-track">
                    <div className={`bar-fill ${drive.usage > 90 ? 'warn' : ''}`} style={{ width: `${drive.usage}%` }} />
                  </div>
                )}
              </div>
            ))}
            {storage?.summary && Number.isFinite(storage.summary.totalFree) && (
              <div className="kv"><span>Total free</span><span>{storage.summary.totalFree} GB</span></div>
            )}
          </section>
        )}

        <button className="scan-btn" onClick={queueScan} disabled={scanQueued}>
          {scanQueued ? 'SCAN QUEUED — RUNS ON NEXT AGENT HEARTBEAT' : 'REQUEST DEEP SCAN'}
        </button>

        {!scan && (
          <div className="empty-state">
            <strong>No Deep Scan Available</strong>
            <p>
              Request a deep scan: the agent will analyze temp folders, large files and
              potential duplicates locally, then report real results here.
            </p>
          </div>
        )}

        {scan && (
          <div className="panel-grid">
            <section className="panel">
              <h3><span className="dot" />Cleanup Candidates</h3>
              {(scan.cleanupCandidates || []).length === 0 && <p>Nothing collected yet.</p>}
              {(scan.cleanupCandidates || []).map((item) => (
                <div className="kv" key={item.path}>
                  <span>{item.reason}</span>
                  <span title={item.path}>{item.sizeMB.toLocaleString()} MB</span>
                </div>
              ))}
            </section>

            <section className="panel">
              <h3><span className="dot" />Large Files</h3>
              {(scan.largeFiles || []).length === 0 && <p>No files above threshold found in scanned scope.</p>}
              {(scan.largeFiles || []).map((file) => (
                <div className="kv mono" key={file.path}>
                  <span>{(file.sizeMB / 1024).toFixed(2)} GB</span>
                  <span style={{ fontSize: '0.75rem' }}>{file.path}</span>
                </div>
              ))}
            </section>

            <section className="panel">
              <h3><span className="dot sage" />Duplicate Candidates</h3>
              {(scan.duplicateCandidates || []).length === 0 && <p>No same-name/same-size clusters detected.</p>}
              {(scan.duplicateCandidates || []).map((group) => (
                <div key={`${group.name}-${group.paths[0]}`} style={{ marginBottom: '0.9rem' }}>
                  <div className="kv"><span>{group.name}</span><span>{group.sizeMB.toLocaleString()} MB each</span></div>
                  {group.paths.map((path) => (
                    <div className="kv mono" key={path} style={{ fontSize: '0.72rem' }}>
                      <span></span><span>{path}</span>
                    </div>
                  ))}
                </div>
              ))}
            </section>

            <section className="panel">
              <h3><span className="dot" />Scan Info</h3>
              <div className="kv"><span>Scanned at</span><span>{new Date(scan.scannedAt).toLocaleString()}</span></div>
              <div className="kv"><span>Files visited</span><span>{(scan.stats?.filesScanned ?? 0).toLocaleString()}</span></div>
              <div className="kv"><span>Duration</span><span>{((scan.stats?.durationMs ?? 0) / 1000).toFixed(1)} s</span></div>
              <div className="kv"><span>Scope complete</span><span>{scan.stats?.truncated ? 'No (time/limit bound)' : 'Yes'}</span></div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

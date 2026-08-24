import { useCallback, useEffect, useState } from 'react';
import { getDevice } from '../api/client';

export default function useDevice(pollMs = 15000) {
  const [device, setDevice] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getDevice();
      setDevice(data.device);
      setConnected(Boolean(data.connected));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!pollMs) return undefined;
    const timer = setInterval(refresh, pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  return { device, connected, loading, error, refresh };
}

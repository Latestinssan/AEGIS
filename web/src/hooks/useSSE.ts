import { useEffect, useState } from "react";

export function useSSE<T>(url: string, onEvent: (event: T) => void, enabled = true): { live: boolean } {
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let retry: number | undefined;
    let closed = false;

    const connect = () => {
      source = new EventSource(url);
      source.onopen = () => setLive(true);
      source.onerror = () => {
        setLive(false);
        if (!closed) {
          retry = window.setTimeout(connect, 2500);
        }
      };
      source.onmessage = (msg) => {
        try {
          onEvent(JSON.parse(msg.data) as T);
        } catch {
          /* ignore malformed frames */
        }
      };
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      source?.close();
      setLive(false);
    };
  }, [url, enabled, onEvent]);

  return { live };
}

export function useCountdown(expiresAt: number | null): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  return left;
}
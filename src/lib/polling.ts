// src/lib/polling.ts
// OrthoCall UIX — polling helper (single source)

export function startPoll(fn: () => Promise<void> | void, intervalMs: number) {
  let stopped = false;
  let inFlight = false;

  const tick = async () => {
    if (stopped) return;
    if (inFlight) return; // overlap/spam engeli
    inFlight = true;
    try {
      await fn();
    } finally {
      inFlight = false;
    }
  };

  // immediate run
  tick().catch(() => {});

  const t = setInterval(() => {
    tick().catch(() => {});
  }, Math.max(1000, intervalMs));

  return () => {
    stopped = true;
    clearInterval(t);
  };
}

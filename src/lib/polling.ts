export function startPoll(fn: () => Promise<void> | void, intervalMs: number) {
  let stopped = false;
  let inFlight = false;

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try { await fn(); } finally { inFlight = false; }
  };

  tick().catch(() => {});
  const t = setInterval(() => tick().catch(() => {}), Math.max(1000, intervalMs));

  return () => { stopped = true; clearInterval(t); };
}

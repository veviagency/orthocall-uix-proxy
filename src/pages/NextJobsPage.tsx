import { useEffect, useMemo, useState } from "react";
import { opsFetch } from "../lib/opsClient";
import { startPoll } from "../lib/polling";

function utcLabel(offsetHours: number) {
  const n = Number.isFinite(offsetHours) ? offsetHours : 0;
  const sign = n >= 0 ? "+" : "";
  return `Central Ops Time (UTC${sign}${n})`;
}

export function NextJobsPage() {
  const [data, setData] = useState<any>(null);
  const tzOffset = useMemo(() => Number(data?.tz_offset_hours ?? 0), [data]);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];

  async function load() {
    const r = await opsFetch("/next-jobs?limit=3", { method: "GET" });
    setData(r);
  }

  useEffect(() => {
    const stop = startPoll(load, 20000);
    return stop;
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, fontWeight: 600 }}>{utcLabel(tzOffset)}</div>
      <h2>Next Jobs</h2>
      <button onClick={load} style={{ marginBottom: 12 }}>Refresh</button>

      <div style={{ display: "grid", gap: 12 }}>
        {jobs.map((j: any) => (
          <div key={String(j.job_id)} style={{ border: "1px solid #444", padding: 12 }}>
            <div><b>lead:</b> {j?.lead_hint?.first_name} {j?.lead_hint?.last_initial}. • …{j?.lead_hint?.phone_last4}</div>
            <div><b>call_type:</b> {String(j?.call_type || "")}</div>
            <div><b>next_action_at:</b> {String(j?.next_action_at_label || "")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

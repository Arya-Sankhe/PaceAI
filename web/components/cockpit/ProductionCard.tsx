export function ProductionCard({ values }: { values: Record<string, number> }) {
  const good = values.count_good;
  const bad = values.count_bad;
  const total = good != null && bad != null ? good + bad : null;
  const scrap = total && bad != null ? (100 * bad) / total : null;
  const fault = values.fault_code;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-2 text-sm font-medium text-zinc-300">Production & OEE</h3>
      <div className="flex gap-6 text-sm">
        <span><b className="text-lg">{good != null ? good.toLocaleString() : "—"}</b> <span className="text-zinc-500">good</span></span>
        <span><b className="text-lg">{bad != null ? bad.toLocaleString() : "—"}</b> <span className="text-zinc-500">bad</span></span>
        <span><b className="text-lg">{scrap != null ? `${scrap.toFixed(1)}%` : "—"}</b> <span className="text-zinc-500">scrap</span></span>
        <span className={values.running == null ? "text-zinc-500" : values.running ? "text-emerald-300" : "text-zinc-400"}>
          {values.running == null ? "UNKNOWN" : values.running ? "RUNNING" : "STOPPED"}
        </span>
      </div>
      {fault != null && fault !== 0 && (
        <div className="mt-2 rounded bg-red-500/10 px-2 py-1 text-sm text-red-300">Fault code {fault}</div>
      )}
    </div>
  );
}

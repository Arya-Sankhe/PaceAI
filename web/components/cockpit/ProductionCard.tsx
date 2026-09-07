export function ProductionCard({ values }: { values: Record<string, number> }) {
  const good = values.count_good ?? 0;
  const bad = values.count_bad ?? 0;
  const total = good + bad;
  const scrap = total > 0 ? (100 * bad) / total : 0;
  const fault = values.fault_code;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-2 text-sm font-medium text-zinc-300">Production & OEE</h3>
      <div className="flex gap-6 text-sm">
        <span><b className="text-lg">{good.toLocaleString()}</b> <span className="text-zinc-500">good</span></span>
        <span><b className="text-lg">{bad.toLocaleString()}</b> <span className="text-zinc-500">bad</span></span>
        <span><b className="text-lg">{scrap.toFixed(1)}%</b> <span className="text-zinc-500">scrap</span></span>
        <span className={values.running ? "text-emerald-300" : "text-zinc-400"}>
          {values.running ? "RUNNING" : "STOPPED"}
        </span>
      </div>
      {fault != null && fault !== 0 && (
        <div className="mt-2 rounded bg-red-500/10 px-2 py-1 text-sm text-red-300">Fault code {fault}</div>
      )}
    </div>
  );
}

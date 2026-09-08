// ponytail: one generic card, not four copies — prefix comes from meta.ts
export function HeaterZoneCard({ prefix, label, values }: { prefix: string; label: string; values: Record<string, number> }) {
  const temp = values[`${prefix}_temp`];
  const set = values[`${prefix}_set`];
  const out = values[`${prefix}_output`];
  const intol = values[`${prefix}_tol`];
  const pct = out != null ? Math.min(100, Math.max(0, out)) : 0;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">{label}</h3>
        {intol != null && (
          <span title={intol ? "In tolerance" : "Out of tolerance"}
            className={`inline-block h-3 w-3 rounded-full ${intol ? "bg-emerald-400" : "bg-red-400"}`} />
        )}
      </div>
      <div className="text-2xl font-semibold">
        {temp != null ? `${temp.toFixed(1)}°C` : "—"}
        <span className="ml-2 text-sm font-normal text-zinc-400">
          {set != null ? `set ${set.toFixed(0)}°C` : ""}
        </span>
      </div>
      <div className="mt-2 h-2 rounded bg-zinc-800" title={`Output ${out ?? "unknown"}%`}>
        <div className="h-2 rounded bg-orange-400" style={{ width: out == null ? "0%" : `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-zinc-500">out {out != null ? `${out.toFixed(0)}%` : "—"}</div>
    </div>
  );
}

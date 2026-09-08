export function ServoAxisCard({ prefix, label, values }: { prefix: string; label: string; values: Record<string, number> }) {
  const vel = values[`${prefix}_rpm`];
  const cur = values[`${prefix}_current`];
  const err = values[`${prefix}_error_id`];
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">{label} <span className="text-zinc-500">({prefix.toUpperCase()})</span></h3>
        {err != null && err !== 0 && (
          <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">ERR {err}</span>
        )}
      </div>
      <div className="flex gap-4 text-sm">
        <span className="text-xl font-semibold">{vel != null ? `${vel.toFixed(0)}` : "—"} <span className="text-xs font-normal text-zinc-500">rpm</span></span>
        <span className="self-end text-zinc-400">{cur != null ? `${cur.toFixed(1)} A` : ""}</span>
      </div>
    </div>
  );
}

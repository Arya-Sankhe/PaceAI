import { fmtNum, num, on } from "./meta";

export function HeaterZoneCard({ prefix, label, values }: { prefix: string; label: string; values: Record<string, number> }) {
  const temp = num(values, `${prefix}_temp`);
  const set = num(values, `${prefix}_set`);
  const out = num(values, `${prefix}_output`);
  const intol = on(values, `${prefix}_tol`);
  const zoneOn = on(values, `${prefix}_heater_on`);
  const pct = out != null ? Math.min(100, Math.max(0, out)) : 0;
  const delta = temp != null && set != null ? temp - set : undefined;
  const attention = intol === false;

  return (
    <div
      className="glass-soft lift p-5"
      style={attention ? { borderColor: "rgba(255,93,93,0.35)", boxShadow: "0 0 0 1px rgba(255,93,93,0.15), 0 18px 44px rgba(0,0,0,0.25)" } : undefined}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-white">{label}</h3>
        <StatusPill state={intol == null ? "unknown" : intol ? "ok" : "bad"} text={intol == null ? "—" : intol ? "In tolerance" : "Needs attention"} />
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-[36px] font-semibold leading-none tracking-tight tabular text-white">
          {temp != null ? temp.toFixed(1) : "—"}
        </span>
        <span className="text-[13px] text-white/45">°C</span>
        <span className="ml-auto font-mono text-[12px] text-white/45">
          set {set != null ? `${set.toFixed(1)}°` : "—"}
        </span>
      </div>
      <div className={`mt-1 text-[12.5px] font-medium ${attention ? "text-[#ff8a8a]" : "text-white/50"}`}>
        {delta == null ? "No deviation data" : delta >= 0 ? `+${delta.toFixed(1)}° above setpoint` : `${delta.toFixed(1)}° below setpoint`}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[12px]">
          <span className="text-white/45">Output</span>
          <span className="font-mono font-semibold tabular text-white">{out != null ? `${out.toFixed(1)}%` : "—"}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{
              width: out == null ? "0%" : `${pct}%`,
              background: attention ? "#ff5d5d" : "linear-gradient(90deg, rgba(255,255,255,0.55), #fff)",
              boxShadow: attention ? "0 0 10px rgba(255,93,93,0.7)" : "0 0 10px rgba(255,255,255,0.35)",
            }}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-[12px]">
        <Mini label="Setpoint" value={set != null ? `${fmtNum(set)}°` : "—"} />
        <Mini label="Heater" value={zoneOn == null ? "—" : zoneOn ? "On" : "Off"} tone={zoneOn == null ? undefined : zoneOn ? "ok" : "muted"} />
        <Mini label="Tolerance" value={intol == null ? "—" : intol ? "In" : "Out"} tone={intol == null ? undefined : intol ? "ok" : "bad"} />
      </dl>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" | "muted" }) {
  const color = tone === "ok" ? "text-emerald-300" : tone === "bad" ? "text-[#ff8a8a]" : "text-white";
  return (
    <div>
      <dt className="text-white/40">{label}</dt>
      <dd className={`mt-0.5 font-semibold tabular ${color}`}>{value}</dd>
    </div>
  );
}

export function StatusPill({ state, text }: { state: "ok" | "bad" | "warn" | "unknown"; text: string }) {
  const cls =
    state === "ok" ? "border-emerald-300/25 bg-emerald-300/15 text-emerald-100"
    : state === "bad" ? "border-red-400/30 bg-red-400/15 text-red-100"
    : state === "warn" ? "border-amber-300/25 bg-amber-300/15 text-amber-100"
    : "border-white/10 bg-white/10 text-white/60";
  return <span className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${cls}`}>{text}</span>;
}

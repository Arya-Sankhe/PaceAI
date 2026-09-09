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
    <div className={`card-flat p-5 ${attention ? "border-[#d70015]/25" : ""}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-medium text-[#1d1d1f]">{label}</h3>
        <StatusPill state={intol == null ? "unknown" : intol ? "ok" : "bad"} text={intol == null ? "—" : intol ? "In tolerance" : "Needs attention"} />
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-[34px] font-semibold leading-none tracking-tight tabular">
          {temp != null ? temp.toFixed(1) : "—"}
        </span>
        <span className="text-[13px] text-[#6e6e73]">°C</span>
        <span className="ml-auto font-mono text-[12px] text-[#6e6e73]">
          set {set != null ? `${set.toFixed(1)}°` : "—"}
        </span>
      </div>
      <div className={`mt-1 text-[12.5px] ${attention ? "text-[#d70015]" : "text-[#6e6e73]"}`}>
        {delta == null ? "No deviation data" : delta >= 0 ? `+${delta.toFixed(1)}° above setpoint` : `${delta.toFixed(1)}° below setpoint`}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[12px]">
          <span className="text-[#6e6e73]">Output</span>
          <span className="font-mono text-[#1d1d1f]">{out != null ? `${out.toFixed(1)}%` : "—"}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
          <div
            className={`h-full rounded-full ${attention ? "bg-[#d70015]" : "bg-[#1d1d1f]"}`}
            style={{ width: out == null ? "0%" : `${pct}%` }}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-black/[0.05] pt-3 text-[12px]">
        <Mini label="Setpoint" value={set != null ? `${fmtNum(set)}°` : "—"} />
        <Mini label="Heater" value={zoneOn == null ? "—" : zoneOn ? "On" : "Off"} tone={zoneOn == null ? undefined : zoneOn ? "ok" : "muted"} />
        <Mini label="Tolerance" value={intol == null ? "—" : intol ? "In" : "Out"} tone={intol == null ? undefined : intol ? "ok" : "bad"} />
      </dl>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" | "muted" }) {
  const color = tone === "ok" ? "text-[#1d8127]" : tone === "bad" ? "text-[#d70015]" : "text-[#1d1d1f]";
  return (
    <div>
      <dt className="text-[#6e6e73]">{label}</dt>
      <dd className={`mt-0.5 font-medium tabular ${color}`}>{value}</dd>
    </div>
  );
}

export function StatusPill({ state, text }: { state: "ok" | "bad" | "warn" | "unknown"; text: string }) {
  const cls =
    state === "ok" ? "bg-[#1d8127]/10 text-[#1d8127]"
    : state === "bad" ? "bg-[#d70015]/[0.07] text-[#d70015]"
    : state === "warn" ? "bg-[#b45309]/10 text-[#b45309]"
    : "bg-black/[0.05] text-[#515154]";
  return <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium ${cls}`}>{text}</span>;
}

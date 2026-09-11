import { fmtNum, num, on } from "./meta";
import { StatusPill } from "./HeaterZoneCard";

export function ServoAxisCard({
  prefix, label, hasPos, values, errorText,
}: {
  prefix: string; label: string; hasPos: boolean;
  values: Record<string, number>; errorText?: string;
}) {
  const vel = num(values, `${prefix}_rpm`);
  const cur = num(values, `${prefix}_current`);
  const err = num(values, `${prefix}_error_id`);
  const active = on(values, `${prefix}_error_active`);
  const temp = num(values, `${prefix}_temp`);
  const pos = num(values, `${prefix}_position`);
  const fault = (err != null && err !== 0) && active === true;

  return (
    <div
      className="glass-soft lift p-5"
      style={fault ? { borderColor: "rgba(255,93,93,0.35)", boxShadow: "0 0 0 1px rgba(255,93,93,0.15), 0 18px 44px rgba(0,0,0,0.25)" } : undefined}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-white">
          {prefix.toUpperCase()} <span className="font-normal text-white/45">· {label}</span>
        </h3>
        <StatusPill state={fault ? "bad" : "ok"} text={fault ? `Fault ${Math.round(err ?? 0)}` : "Healthy"} />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-[28px] font-semibold leading-none tracking-tight tabular text-white">
          {vel != null ? vel.toFixed(1) : "—"}
        </span>
        <span className="text-[12px] text-white/45">rpm</span>
        <span className="ml-auto font-mono text-[12px] text-white/45">
          {cur != null ? `${cur.toFixed(2)} A` : "—"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-white/10 pt-3 text-[12px]">
        <Row label="Motor temp" value={temp == null ? "—" : `${fmtNum(temp)} °C`} />
        {hasPos
          ? <Row label="Position" value={pos == null ? "—" : `${fmtNum(pos)}°`} />
          : <Row label="Error ID" value={err == null ? "—" : String(Math.round(err))} />}
        <Row label="Current" value={cur == null ? "—" : `${fmtNum(cur, 2)} A`} />
        <Row label="Monitoring" value={active == null ? "—" : active ? "Active" : "Clear"} tone={active == null ? undefined : active ? "bad" : "ok"} />
      </dl>

      {prefix === "vs" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Flag on={on(values, "vs_powered_on")} label="Power" />
          <Flag on={on(values, "vs_is_homed")} label="Homed" />
          <Flag on={on(values, "vs_in_sync")} label="In sync" />
        </div>
      )}
      {fault && errorText ? <p className="mt-3 text-[12.5px] leading-snug text-[#ff8a8a]">{errorText}</p> : null}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-300" : tone === "bad" ? "text-[#ff8a8a]" : "text-white";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-white/40">{label}</dt>
      <dd className={`font-semibold tabular ${color}`}>{value}</dd>
    </div>
  );
}

function Flag({ on, label }: { on: boolean | undefined; label: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${
      on == null ? "border-white/10 bg-white/[0.06] text-white/50" : on ? "border-emerald-300/25 bg-emerald-300/15 text-emerald-100" : "border-white/10 bg-white/[0.06] text-white/50"
    }`}>
      {label}: {on == null ? "—" : on ? "Yes" : "No"}
    </span>
  );
}

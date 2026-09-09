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
    <div className={`card-flat p-5 ${fault ? "border-[#d70015]/25" : ""}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-medium text-[#1d1d1f]">
          {prefix.toUpperCase()} <span className="font-normal text-[#6e6e73]">· {label}</span>
        </h3>
        <StatusPill state={fault ? "bad" : "ok"} text={fault ? `Fault ${Math.round(err ?? 0)}` : "Healthy"} />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-[26px] font-semibold leading-none tracking-tight tabular">
          {vel != null ? vel.toFixed(1) : "—"}
        </span>
        <span className="text-[12px] text-[#6e6e73]">rpm</span>
        <span className="ml-auto font-mono text-[12px] text-[#6e6e73]">
          {cur != null ? `${cur.toFixed(2)} A` : "—"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-black/[0.05] pt-3 text-[12px]">
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
      {fault && errorText ? <p className="mt-3 text-[12.5px] leading-snug text-[#d70015]">{errorText}</p> : null}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-[#1d8127]" : tone === "bad" ? "text-[#d70015]" : "text-[#1d1d1f]";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[#6e6e73]">{label}</dt>
      <dd className={`font-medium tabular ${color}`}>{value}</dd>
    </div>
  );
}

function Flag({ on, label }: { on: boolean | undefined; label: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium ${
      on == null ? "bg-black/[0.05] text-[#515154]" : on ? "bg-[#1d8127]/10 text-[#1d8127]" : "bg-black/[0.05] text-[#515154]"
    }`}>
      {label}: {on == null ? "—" : on ? "Yes" : "No"}
    </span>
  );
}

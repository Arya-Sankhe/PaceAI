import { UTIL_LABELS, fmtHms, fmtNum, fmtShift, num } from "./meta";

export function OeePanel({
  values, titles,
}: {
  values: Record<string, number>;
  titles: { planned_dt?: string[]; unplanned_dt?: string[] };
}) {
  const util = UTIL_LABELS.map((_, i) => num(values, `util_${i}`) ?? 0);
  const maxUtil = Math.max(...util, 1);
  const pdt = (titles.planned_dt ?? []).map((t, i) => ({ t, c: num(values, `pdt_${i}`) ?? 0 }));
  const udt = (titles.unplanned_dt ?? []).map((t, i) => ({ t, c: num(values, `udt_${i}`) ?? 0 }));
  const good = num(values, "count_good");
  const bad = num(values, "count_bad");
  const total = good != null && bad != null ? good + bad : null;
  const scrap = total && bad != null && total > 0 ? (100 * bad) / total : null;
  const running = num(values, "running");
  const fault = num(values, "fault_code");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Good bags" value={good == null ? "—" : Math.round(good).toLocaleString()} />
        <Stat label="Rejected" value={bad == null ? "—" : Math.round(bad).toLocaleString()} />
        <Stat label="Scrap rate" value={scrap == null ? "—" : `${scrap.toFixed(1)}%`} />
        <Stat
          label="Line state"
          value={running == null ? "Unknown" : running ? "Running" : "Stopped"}
          tone={running ? "ok" : undefined}
        />
      </div>

      <div className="card p-5 sm:p-6">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-[16px] font-semibold tracking-tight">Shift</h3>
          <span className="text-[12.5px] text-[#6e6e73]">Total {fmtShift(num(values, "shift_total_time"))}</span>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <ShiftStat label="Bags remaining" value={num(values, "prod_remaining") == null ? "—" : Math.round(num(values, "prod_remaining")!).toLocaleString()} />
          <ShiftStat label="Planned downtime left" value={num(values, "planned_dt_remaining") == null ? "—" : `${fmtNum(num(values, "planned_dt_remaining"))}%`} />
          <ShiftStat label="Unplanned downtime left" value={num(values, "unplanned_dt_remaining") == null ? "—" : `${fmtNum(num(values, "unplanned_dt_remaining"))}%`} />
        </div>
        {fault != null && fault !== 0 && (
          <p className="mt-4 rounded-2xl bg-[#d70015]/[0.06] px-4 py-3 text-[13.5px] font-medium text-[#d70015]">
            Fault code {Math.round(fault)} active
          </p>
        )}
      </div>

      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="font-display text-[16px] font-semibold tracking-tight">Utilization</h3>
          <span className="text-[12.5px] text-[#6e6e73]">Primary · {fmtHms(util[0])}</span>
        </div>
        <ul className="space-y-2.5">
          {UTIL_LABELS.map((label, i) => (
            <li key={label} className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-3 text-[13px]">
              <span className="text-[#515154]">{label}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                <div className="h-full rounded-full bg-[#1d1d1f]" style={{ width: `${(util[i] / maxUtil) * 100}%` }} />
              </div>
              <span className="text-right font-medium tabular text-[#1d1d1f]">{fmtHms(util[i])}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card p-5 sm:p-6">
          <DtList title="Planned downtime" rows={pdt} unplanned={false} />
        </div>
        <div className="card p-5 sm:p-6">
          <DtList title="Unplanned downtime" rows={udt} unplanned />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="card p-5">
      <div className="text-[12.5px] text-[#6e6e73]">{label}</div>
      <div className={`font-display mt-1 text-[24px] font-semibold leading-none tracking-tight tabular ${tone === "ok" ? "text-[#1d8127]" : ""}`}>{value}</div>
    </div>
  );
}

function ShiftStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/[0.03] px-4 py-3.5">
      <div className="text-[12px] text-[#6e6e73]">{label}</div>
      <div className="font-display mt-1 text-[19px] font-semibold leading-none tracking-tight tabular">{value}</div>
    </div>
  );
}

function DtList({ title, rows, unplanned }: { title: string; rows: { t: string; c: number }[]; unplanned: boolean }) {
  const sorted = [...rows].sort((a, b) => b.c - a.c);
  const max = Math.max(...sorted.map((r) => r.c), 1);
  return (
    <div>
      <h3 className="font-display mb-3 text-[15px] font-semibold tracking-tight">{title}</h3>
      <ul className="space-y-2.5">
        {sorted.map((r) => (
          <li key={r.t} className="text-[13px]">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-[#1d1d1f]" title={r.t}>{r.t}</span>
              <span className="font-medium tabular text-[#6e6e73]">{r.c}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-black/[0.06]">
              <div className={`h-full rounded-full ${unplanned ? "bg-[#d70015]/70" : "bg-black/40"}`} style={{ width: `${(r.c / max) * 100}%` }} />
            </div>
          </li>
        ))}
        {sorted.length === 0 && <li className="text-[13px] text-[#6e6e73]">No entries.</li>}
      </ul>
    </div>
  );
}

import { fmtNum, num, on } from "./meta";

const INFO_ROWS: { key: string; label: string }[] = [
  { key: "manufacturer", label: "Manufacturer" },
  { key: "model", label: "Model" },
  { key: "serial", label: "Serial" },
  { key: "software", label: "Software" },
  { key: "ip_address", label: "IP address" },
  { key: "date_time", label: "PLC time" },
  { key: "server_time", label: "Server time" },
];

export function MachineInfoCard({ values, info }: { values: Record<string, number>; info: Record<string, string> }) {
  const state = num(values, "server_state");
  const running = state === 0;
  return (
    <section className="glass p-5 sm:p-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-[16px] font-semibold tracking-tight text-white">Machine</h2>
        <span className="font-mono text-[12px] text-white/45">{info.ip_address || "—"}</span>
      </div>
      <dl className="divide-y divide-white/[0.07] text-[13.5px]">
        {INFO_ROWS.map((r) => (
          <div key={r.key} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-white/45">{r.label}</dt>
            <dd className="text-right font-medium tabular text-white">{info[r.key] || "—"}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-white/45">Server state</dt>
          <dd className={`font-semibold ${running ? "text-emerald-300" : "text-[#ff8a8a]"}`}>
            {state == null ? "—" : running ? "Running" : `Code ${state}`}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-white/45">Alarm count</dt>
          <dd className="font-semibold tabular text-white">{fmtNum(num(values, "alarm_count"), 0)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-white/45">Web roll center</dt>
          <dd className="font-semibold tabular text-white">{num(values, "web_roll_center") == null ? "—" : `${fmtNum(num(values, "web_roll_center"))} mm`}</dd>
        </div>
      </dl>
    </section>
  );
}

const IO = [
  { key: "poker_active", label: "Poker", kind: "bool" },
  { key: "dancer_pos", label: "Dancer position", kind: "mm" },
  { key: "dia_bypass", label: "Diameter bypass", kind: "bool" },
  { key: "unwind_dia_inline", label: "Diameter inline", kind: "bool" },
  { key: "stripping_active", label: "Stripping", kind: "bool" },
  { key: "advance_cycle_dump", label: "Cycle dump", kind: "int" },
] as const;

export function MachineStatusCard({ values }: { values: Record<string, number> }) {
  return (
    <section className="glass p-5 sm:p-6">
      <h2 className="font-display mb-1 text-[16px] font-semibold tracking-tight text-white">Inputs & outputs</h2>
      <p className="mb-4 text-[13px] text-white/45">Live signal states from the controller.</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {IO.map((item) => {
          if (item.kind === "bool") {
            const v = on(values, item.key);
            return (
              <div key={item.key} className="rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3.5 py-3">
                <div className="text-[12px] text-white/45">{item.label}</div>
                <div className={`mt-1 flex items-center gap-1.5 text-[14px] font-bold ${v == null ? "text-white/40" : v ? "text-emerald-300" : "text-white/60"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${v == null ? "bg-white/25" : v ? "bg-emerald-300" : "bg-white/30"}`} />
                  {v == null ? "—" : v ? "On" : "Off"}
                </div>
              </div>
            );
          }
          const n = num(values, item.key);
          return (
            <div key={item.key} className="rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3.5 py-3">
              <div className="text-[12px] text-white/45">{item.label}</div>
              <div className="mt-1 text-[14px] font-bold tabular text-white">
                {n == null ? "—" : item.kind === "mm" ? `${fmtNum(n)} mm` : String(Math.round(n))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

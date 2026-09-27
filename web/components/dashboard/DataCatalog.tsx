"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, LineChart, Search, Sparkles, ToggleRight, X } from "lucide-react";
import type { Signal } from "@/lib/api";
import { fmt, unitText } from "./viz";

const ORDER = ["Heaters", "Drives", "Production", "Downtime", "Utilization", "Machine"];

/** Every signal the machine reports, live, one click from the board. */
export function DataCatalog({ open, signals, values, onClose, onAdd, onAsk }: {
  open: boolean;
  signals: Signal[];
  values: Record<string, number>;
  onClose: () => void;
  onAdd: (s: Signal, as: "stat" | "line" | "status") => void;
  onAsk: (s: Signal) => void;
}) {
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = signals.filter((s) => words.every((w) => `${s.label} ${s.key} ${s.group} ${s.unit}`.toLowerCase().includes(w)));
    return ORDER.map((g) => ({ g, items: hit.filter((s) => s.group === g) })).filter((x) => x.items.length);
  }, [q, signals]);

  const add = (s: Signal, as: "stat" | "line" | "status") => {
    onAdd(s, as);
    setAdded(`${s.key}:${as}`);
    setTimeout(() => setAdded((c) => (c === `${s.key}:${as}` ? null : c)), 1200);
  };

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Machine data"
        className={`dash-sheet absolute bottom-2 right-2 top-2 flex w-[min(420px,calc(100vw-16px))] flex-col transition-transform duration-500 ${open ? "translate-x-0" : "translate-x-[110%]"}`}
        style={{ transitionTimingFunction: "var(--ease-spring)" }}
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[18px] font-semibold text-white">Machine data</h2>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/50">
              {signals.length} live signals. Add one directly, or ask for anything built from them — ratios, deviations, comparisons.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <label className="mx-5 mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 focus-within:border-white/35">
          <Search size={14} aria-hidden="true" className="text-white/40" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search temperature, current, downtime…"
            aria-label="Search signals"
            className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/35 focus-visible:outline-none"
          />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {groups.length === 0 && <p className="px-2 py-10 text-center text-[13px] text-white/45">Nothing matches “{q}”. The machine doesn’t report that directly — try asking for it; it may be derivable.</p>}
          {groups.map(({ g, items }) => (
            <section key={g} className="mb-3">
              <h3 className="sticky top-0 z-10 bg-[#141b22]/90 px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/40 backdrop-blur">
                {g} <span className="text-white/25">· {items.length}</span>
              </h3>
              <ul>
                {items.map((s) => {
                  const v = values[s.key];
                  return (
                    <li key={s.key} className="group/row flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.05]">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-white/85">{s.label}</div>
                        <div className="truncate font-mono text-[10.5px] text-white/30">{s.key}</div>
                      </div>
                      <span className="shrink-0 text-right text-[12.5px] font-semibold tabular text-white/80">
                        {s.kind === "bool" ? (v == null ? "—" : v ? "On" : "Off") : fmt(v, s.unit)}
                        {s.kind !== "bool" && unitText(s.unit) && <span className="ml-0.5 font-normal text-white/40">{unitText(s.unit)}</span>}
                      </span>
                      <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                        {(s.kind === "bool" ? (["status"] as const) : (["stat", "line"] as const)).map((as) => {
                          const Icon = as === "stat" ? Hash : as === "line" ? LineChart : ToggleRight;
                          const done = added === `${s.key}:${as}`;
                          return (
                            <button
                              key={as}
                              type="button"
                              onClick={() => add(s, as)}
                              aria-label={`Add ${s.label} as ${as === "stat" ? "a number" : as === "line" ? "a chart" : "a status light"}`}
                              title={as === "stat" ? "Add as number" : as === "line" ? "Add as live chart" : "Add as status light"}
                              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${done ? "bg-[#4ade80] text-black" : "text-white/60 hover:bg-white hover:text-black"}`}
                            >
                              <Icon size={14} aria-hidden="true" />
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => onAsk(s)}
                          aria-label={`Ask about ${s.label}`}
                          title="Ask for a widget using this"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:bg-white hover:text-black"
                        >
                          <Sparkles size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}

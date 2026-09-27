"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUp, Cog, Database, Flame, Gauge, Mic, Sparkles, Trash2, TrendingUp, Undo2, X,
} from "lucide-react";
import {
  api, type ApiEvent, type DashboardPlan, type DashboardSpec, type PlannerWidget, type Signal, type Widget,
} from "@/lib/api";
import { useDictation } from "@/hooks/useDictation";
import { useMachineLatest } from "@/hooks/useMachineLatest";
import { DashboardGrid } from "./DashboardGrid";
import { DataCatalog } from "./DataCatalog";
import { LIVE_MS, type BoardData, type Sample } from "./WidgetCard";
import { MIN, addWidgets, compact, newId, place } from "./layout";

const STORE = (machineKey: string) => `paceai.dashboard.v2.${machineKey}`;
const MAX_SAMPLES = 900;

const TEMPLATES = [
  { icon: Flame, title: "Heat sealing", ask: "Every heater zone live vs its setpoint, plus the front heater's output on a gauge and a table of zone temperatures" },
  { icon: TrendingUp, title: "Shift performance", ask: "Good vs rejected bags, reject rate as a big number, bags remaining this shift and the top planned downtime reasons" },
  { icon: Cog, title: "Drive health", ask: "Compare all six drive currents, a table of drive temperatures, and status lights for any drive errors" },
  { icon: Gauge, title: "Line at a glance", ask: "Is the line running, are all heaters in tolerance, box forming speed on a gauge, and recent events" },
];
const EXAMPLES = [
  "Reject rate as a big number",
  "Which planned downtime reasons are highest?",
  "Front heater deviation from setpoint, last 8h",
  "Average current across all drives, live",
  "Are any drives faulted?",
  "Film feed speed on a gauge",
];

// v1 boards (tags, 4-column widths) carry over rather than vanish.
function migrateV1(machineKey: string): DashboardSpec | null {
  try {
    const raw = localStorage.getItem(`paceai.dashboard.${machineKey}`);
    if (!raw) return null;
    const old = JSON.parse(raw) as { title?: string; widgets?: { type: string; title: string; tags?: string[]; window?: string }[] };
    const metrics = (tags?: string[]) => (tags ?? []).map((key) => ({ key, label: key.replace(/_/g, " ") }));
    const mapped: PlannerWidget[] = (old.widgets ?? []).flatMap((w): PlannerWidget[] => {
      if (w.type === "stat") return [{ type: "stat", title: w.title, metrics: metrics(w.tags).slice(0, 6) }];
      if (w.type === "trend" || w.type === "live") {
        return [{ type: "line", title: w.title, metrics: metrics(w.tags).slice(0, 6), window: w.type === "live" ? "live" : (w.window as PlannerWidget["window"]) ?? "1h" }];
      }
      if (w.type === "zones") return [{ type: "heaters", title: w.title }];
      if (w.type === "axes") return [{ type: "drives", title: w.title }];
      if (w.type === "events") return [{ type: "events", title: w.title }];
      if (w.type === "oee") return [{ type: "split", title: w.title, metrics: metrics(["count_good", "count_bad"]) }];
      return [];
    });
    return mapped.length ? { title: old.title ?? "Live dashboard", widgets: addWidgets([], mapped) } : null;
  } catch {
    return null;
  }
}

const forPlanner = (w: Widget): PlannerWidget => {
  const { x: _x, y: _y, w: _w, h: _h, size: _s, ...rest } = w;
  return rest;
};

export function DashboardStudio({ machineKey }: { machineKey: string }) {
  const { state } = useMachineLatest(machineKey);
  const [spec, setSpec] = useState<DashboardSpec | null>(null);
  const [loaded, setLoaded] = useState(false);
  const undoStack = useRef<(DashboardSpec | null)[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [reply, setReply] = useState<{ text: string; tone: "ok" | "error"; undoable: boolean } | null>(null);
  const [input, setInput] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [signals, setSignals] = useState<Signal[]>([]);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [exampleAt, setExampleAt] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const samples = useRef<Sample[]>([]);
  const specRef = useRef(spec);
  specRef.current = spec;

  // ---- persistence + undo ---------------------------------------------------

  useEffect(() => {
    setMounted(true);
    let next: DashboardSpec | null = null;
    try {
      const raw = localStorage.getItem(STORE(machineKey));
      next = raw ? (JSON.parse(raw) as DashboardSpec) : migrateV1(machineKey);
    } catch {
      next = null;
    }
    setSpec(next);
    undoStack.current = [];
    setUndoCount(0);
    setReply(null);
    setFocusId(null);
    setLoaded(true);
  }, [machineKey]);

  const persist = useCallback((next: DashboardSpec | null) => {
    try {
      if (next && next.widgets.length) localStorage.setItem(STORE(machineKey), JSON.stringify(next));
      else localStorage.removeItem(STORE(machineKey));
    } catch {
      /* storage unavailable — the board still works for this session */
    }
  }, [machineKey]);

  /** Every change goes through here, so every change can be undone. */
  const commit = useCallback((update: (cur: DashboardSpec | null) => DashboardSpec | null) => {
    const cur = specRef.current;
    let next = update(cur);
    if (next && !next.widgets.length) next = null;
    if (next === cur) return;
    undoStack.current = [...undoStack.current.slice(-29), cur];
    setUndoCount(undoStack.current.length);
    specRef.current = next;
    setSpec(next);
    persist(next);
  }, [persist]);

  const undoLast = useCallback(() => {
    const stack = undoStack.current;
    if (!stack.length) return;
    const prev = stack[stack.length - 1];
    undoStack.current = stack.slice(0, -1);
    setUndoCount(undoStack.current.length);
    specRef.current = prev;
    setSpec(prev);
    persist(prev);
    setReply(null);
  }, [persist]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !el.closest("input, textarea")) {
        e.preventDefault();
        undoLast();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoLast]);

  const flash = (ids: string[]) => {
    setFresh(new Set(ids));
    setTimeout(() => setFresh(new Set()), 1800);
    setTimeout(() => document.querySelector(`[data-widget="${ids[0]}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120);
  };

  // ---- machine data ---------------------------------------------------------

  useEffect(() => {
    let alive = true;
    api.dashboardCatalog(machineKey).then((s) => alive && setSignals(s)).catch(() => {});
    const loadEvents = () => api.events(machineKey).then((e) => alive && setEvents(e)).catch(() => {});
    loadEvents();
    const id = setInterval(loadEvents, 30_000);
    // Seed the live buffer so a new chart opens with minutes of context, not an empty axis.
    samples.current = [];
    const until = new Date();
    api.history(machineKey, new Date(until.getTime() - LIVE_MS).toISOString(), until.toISOString())
      .then((h) => {
        if (!alive) return;
        const seed = h.points.map((q) => ({ t: Date.parse(q.t), values: q.values }));
        const first = samples.current[0]?.t ?? Infinity;
        samples.current = [...seed.filter((s) => s.t < first), ...samples.current];
      })
      .catch(() => {});
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [machineKey]);

  // One buffer for the whole board, appended once per telemetry tick (the
  // timestamp check keeps a double render from pushing twice).
  const t = state?.source_ts ? Date.parse(state.source_ts) : null;
  if (t != null && state && samples.current[samples.current.length - 1]?.t !== t) {
    samples.current = [...samples.current.slice(-(MAX_SAMPLES - 1)), { t, values: state.values }];
  }

  const values = useMemo(() => state?.values ?? {}, [state]);
  const signalMap = useMemo(() => Object.fromEntries(signals.map((s) => [s.key, s])), [signals]);
  const data: BoardData = { machineKey, values, samples: samples.current, signals: signalMap, events };

  // ---- asking ---------------------------------------------------------------

  const applyPlan = useCallback((plan: DashboardPlan) => {
    const cur = specRef.current;
    let widgets = (cur?.widgets ?? []).filter((w) => !plan.remove.includes(w.id));
    const touched: string[] = [];
    widgets = widgets.map((w) => {
      const u = plan.update.find((p) => p.id === w.id);
      if (!u) return w;
      touched.push(w.id);
      const min = MIN[u.type];
      return { ...u, id: w.id, x: w.x, y: w.y, w: Math.max(w.w, min.w), h: Math.max(w.h, min.h) };
    });
    widgets = compact(widgets);
    const before = new Set(widgets.map((w) => w.id));
    widgets = addWidgets(widgets, plan.add);
    const added = widgets.filter((w) => !before.has(w.id)).map((w) => w.id);
    const changed = plan.add.length + plan.update.length + plan.remove.length > 0;
    if (changed) {
      commit(() => ({ title: plan.title ?? cur?.title ?? "Live dashboard", widgets }));
      flash([...added, ...touched]);
    }
    return changed;
  }, [commit]);

  const ask = useCallback(async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setBusy(prompt);
    setReply(null);
    setInput("");
    try {
      const plan = await api.dashboardPlan(machineKey, prompt, (specRef.current?.widgets ?? []).map(forPlanner), focusId);
      const changed = applyPlan(plan);
      setReply({
        text: plan.message || (changed ? "Done." : "Nothing to change."),
        tone: "ok",
        undoable: changed,
      });
      setFocusId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "planner_failed";
      setInput(prompt);
      setReply({
        text: msg === "no_widgets"
          ? "I couldn’t build that from this machine’s signals. Try naming what to watch — a temperature, a drive, the shift counts — or browse the data."
          : msg === "planner_unavailable"
            ? "The builder is unavailable right now. Try again in a moment."
            : `Something went wrong (${msg}).`,
        tone: "error",
        undoable: false,
      });
    } finally {
      setBusy(null);
    }
  }, [applyPlan, busy, focusId, machineKey]);

  const onFinal = useCallback((text: string) => setInput((c) => (c.trim() ? `${c.trim()} ${text}` : text)), []);
  const mic = useDictation(onFinal);
  const dictating = mic.status !== "idle";

  useEffect(() => {
    if (input || busy) return;
    const id = setInterval(() => setExampleAt((i) => (i + 1) % EXAMPLES.length), 4000);
    return () => clearInterval(id);
  }, [input, busy]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [input]);

  const focusComposer = () => setTimeout(() => inputRef.current?.focus(), 30);

  // ---- direct edits ---------------------------------------------------------

  const patch = useCallback((id: string, p: Partial<Widget>) => {
    commit((cur) => cur && { ...cur, widgets: compact(cur.widgets.map((w) => (w.id === id ? { ...w, ...p } : w))) });
  }, [commit]);

  const quickAdd = (s: Signal, as: "stat" | "line" | "status") => {
    const w: PlannerWidget = { type: as, title: s.label, metrics: [{ key: s.key, label: s.label, unit: s.unit }], ...(as === "line" ? { window: "live" as const } : {}) };
    const cur = specRef.current;
    const widgets = addWidgets(cur?.widgets ?? [], [w]);
    commit(() => ({ title: cur?.title ?? "Live dashboard", widgets }));
    flash([widgets[widgets.length - 1].id]);
  };

  const duplicate = (id: string) => {
    commit((cur) => {
      const src = cur?.widgets.find((w) => w.id === id);
      if (!cur || !src) return cur;
      const spot = place(cur.widgets, src.w, src.h);
      return { ...cur, widgets: [...cur.widgets, { ...src, id: newId(), title: `${src.title} copy`, ...spot }] };
    });
  };

  const focused = spec?.widgets.find((w) => w.id === focusId) ?? null;
  const count = spec?.widgets.length ?? 0;
  const freshness = state?.freshness ?? "unknown";
  const age = state?.age_seconds;

  // ---- render ---------------------------------------------------------------

  const composer = (
    <div className={`dash-composer ${busy ? "dash-composer--busy" : ""}`}>
      {focused && (
        <div className="flex items-center gap-2 px-3 pt-2.5">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/10 py-1 pl-2.5 pr-1 text-[12px] text-white/80">
            <Sparkles size={12} aria-hidden="true" />
            <span className="truncate">Changing “{focused.title}”</span>
            <button type="button" onClick={() => setFocusId(null)} aria-label="Stop editing this widget" className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/15">
              <X size={11} aria-hidden="true" />
            </button>
          </span>
        </div>
      )}
      <form
        className="flex items-end gap-2 p-2 pl-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <Sparkles size={17} aria-hidden="true" className={`mb-2.5 shrink-0 ${busy ? "animate-pulse text-white" : "text-white/45"}`} />
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
            if (e.key === "Escape") setFocusId(null);
          }}
          disabled={!!busy}
          placeholder={
            busy ? `Building “${busy.length > 56 ? `${busy.slice(0, 55)}…` : busy}”`
              : focused ? "Make it a gauge, add the setpoint, show the last 24h…"
                : spec && mounted && window.innerWidth >= 640 ? `Ask for anything — “${EXAMPLES[exampleAt]}”`
                  : spec ? "Ask for any widget…"
                  : "Describe what you want to watch…"
          }
          aria-label="Ask for a widget"
          className="max-h-[120px] min-h-[40px] min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-snug text-white outline-none placeholder:text-white/40 sm:text-[15px]"
        />
        <button
          type="button"
          onClick={mic.toggle}
          aria-label={dictating ? "Stop dictation" : "Describe it by voice"}
          aria-pressed={dictating}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all ${
            dictating ? "border-[#ff5d5d]/40 bg-[#ff5d5d]/15 text-[#ff8a8a]" : "border-white/10 bg-white/[0.06] text-white/70 hover:border-white/25 hover:text-white"
          }`}
        >
          <Mic size={16} aria-hidden="true" />
        </button>
        <button
          type="submit"
          disabled={!!busy || !input.trim()}
          aria-label="Build it"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-25 disabled:hover:scale-100"
        >
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" /> : <ArrowUp size={17} aria-hidden="true" />}
        </button>
      </form>
      {(dictating || mic.error) && (
        <p className="flex items-center gap-2 px-4 pb-2.5 text-[12.5px]">
          {dictating && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#ff5d5d]" />}
          <span className={`truncate ${mic.error ? "text-[#ff9a9a]" : "text-white/50"}`}>
            {mic.error || mic.partial || (mic.status === "starting" ? "Connecting microphone…" : "Listening…")}
          </span>
        </p>
      )}
    </div>
  );

  const replyBar = reply && (
    <div
      role="status"
      className={`dash-reply ${reply.tone === "error" ? "border-red-300/25 bg-red-400/10" : ""}`}
    >
      <Sparkles size={14} aria-hidden="true" className={`mt-0.5 shrink-0 ${reply.tone === "error" ? "text-red-200" : "text-white/70"}`} />
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-white/85">{reply.text}</p>
      {reply.undoable && (
        <button type="button" onClick={undoLast} className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-white hover:text-black">
          Undo
        </button>
      )}
      <button type="button" onClick={() => setReply(null)} aria-label="Dismiss" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/45 hover:bg-white/10 hover:text-white">
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );

  const catalog = mounted
    ? createPortal(
        <DataCatalog
          open={catalogOpen}
          signals={signals}
          values={values}
          onClose={() => setCatalogOpen(false)}
          onAdd={quickAdd}
          onAsk={(s) => {
            setCatalogOpen(false);
            setInput(`${s.label} `);
            focusComposer();
          }}
        />,
        document.body,
      )
    : null;

  if (!loaded) return null;

  if (!spec) {
    return (
      <div className="enter mx-auto max-w-[760px] pb-10 pt-6 sm:pt-12">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[12px] text-white/65">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
            {signals.length ? `${signals.length} live signals from this machine` : "Connecting to the machine…"}
          </span>
          <h2 className="mt-5 font-display text-[30px] font-semibold leading-tight tracking-tight text-white sm:text-[38px]">
            Ask for any view of your machine.
          </h2>
          <p className="mx-auto mt-3 max-w-[52ch] text-[14.5px] leading-relaxed text-white/60">
            Numbers, gauges, charts, comparisons, status lights — or something computed, like reject rate
            or heater deviation. Every value is read live from the machine, never made up.
          </p>
        </div>
        <div className="mt-7">{composer}</div>
        {reply && <div className="mt-3">{replyBar}</div>}
        {busy && <GhostGrid />}
        {!busy && (
          <>
            <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.title}
                  type="button"
                  onClick={() => void ask(tpl.ask)}
                  className="glass-soft group flex items-start gap-3 !rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5 hover:border-white/25"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80 transition-colors group-hover:bg-white group-hover:text-black">
                    <tpl.icon size={17} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-white">{tpl.title}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-white/55">{tpl.ask}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-6 text-center text-[13px] text-white/50">
              Or{" "}
              <button type="button" onClick={() => setCatalogOpen(true)} className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
                browse everything the machine measures
              </button>{" "}
              and add signals directly.
            </p>
          </>
        )}
        {catalog}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              autoFocus
              defaultValue={spec.title}
              aria-label="Dashboard title"
              onBlur={(e) => {
                setEditingTitle(false);
                const title = e.target.value.trim().slice(0, 60);
                if (title && title !== spec.title) commit((cur) => cur && { ...cur, title });
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-full max-w-[420px] rounded-lg bg-white/10 px-2 py-0.5 font-display text-[22px] font-semibold tracking-tight text-white outline-none"
            />
          ) : (
            <h2
              className="truncate font-display text-[22px] font-semibold tracking-tight text-white"
              onDoubleClick={() => setEditingTitle(true)}
              title="Double-click to rename"
            >
              {spec.title}
            </h2>
          )}
          <p className="mt-0.5 flex items-center gap-2 text-[12.5px] text-white/55">
            <span className={`h-1.5 w-1.5 rounded-full ${freshness === "live" ? "live-dot bg-[#4ade80]" : "bg-[#fbbf24]"}`} />
            {freshness === "live" ? "Live" : freshness === "unknown" ? "Waiting for data" : `Data ${freshness}${age != null ? ` · ${Math.round(age)}s old` : ""}`}
            <span className="text-white/25">·</span>
            {count} widget{count === 1 ? "" : "s"}
            <span className="hidden text-white/35 sm:inline">· drag to move, pull an edge to resize</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setCatalogOpen(true)} className="dash-tool">
            <Database size={14} aria-hidden="true" /> <span className="hidden sm:inline">Machine data</span>
          </button>
          <button type="button" onClick={undoLast} disabled={!undoCount} className="dash-tool" aria-label="Undo" title="Undo (⌘Z)">
            <Undo2 size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              commit(() => null);
              setReply({ text: "Board cleared.", tone: "ok", undoable: true });
            }}
            className="dash-tool"
            aria-label="Clear the board"
            title="Clear the board"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <DashboardGrid
        widgets={spec.widgets}
        data={data}
        focusId={focusId}
        fresh={fresh}
        onCommit={(next) => commit((cur) => cur && { ...cur, widgets: next })}
        onPatch={patch}
        onRemove={(id) => {
          commit((cur) => cur && { ...cur, widgets: compact(cur.widgets.filter((w) => w.id !== id)) });
          if (focusId === id) setFocusId(null);
        }}
        onDuplicate={duplicate}
        onAsk={(id) => {
          setFocusId(id);
          focusComposer();
        }}
      />
      {busy && <GhostGrid />}

      <div className="dash-dock">
        {replyBar}
        {!busy && !input && !focused && !reply && (
          <div className="dash-chips">
            {EXAMPLES.slice(0, 4).map((ex) => (
              <button key={ex} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void ask(ex)} className="dash-chip">
                {ex}
              </button>
            ))}
          </div>
        )}
        {composer}
      </div>
      {catalog}
    </div>
  );
}

function GhostGrid() {
  return (
    <div className="mt-4 grid grid-cols-12 gap-[14px]" aria-hidden="true">
      <div className="dash-ghost col-span-12 h-[150px] sm:col-span-4" />
      <div className="dash-ghost col-span-12 h-[150px] sm:col-span-8" style={{ animationDelay: "120ms" }} />
    </div>
  );
}

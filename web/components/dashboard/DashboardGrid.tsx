"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import {
  BarChart3, Copy, Gauge as GaugeIcon, GripVertical, Hash, LineChart, List, MoreHorizontal, PieChart,
  Sparkles, ToggleRight, Trash2,
} from "lucide-react";
import type { Widget, WidgetType, WidgetWindow } from "@/lib/api";
import { COLS, GAP, MIN, ROW_H, arrange, bottom, type Box } from "./layout";
import { WidgetBody, type BoardData } from "./WidgetCard";
import { useSize } from "./viz";

// Kinds a widget can be re-viewed as, by how many metrics each takes.
const VIEWS: { type: WidgetType; label: string; icon: typeof Hash; min: number; max: number }[] = [
  { type: "stat", label: "Number", icon: Hash, min: 1, max: 6 },
  { type: "gauge", label: "Gauge", icon: GaugeIcon, min: 1, max: 1 },
  { type: "line", label: "Chart", icon: LineChart, min: 1, max: 6 },
  { type: "bars", label: "Bars", icon: BarChart3, min: 2, max: 12 },
  { type: "split", label: "Split", icon: PieChart, min: 2, max: 6 },
  { type: "status", label: "Lights", icon: ToggleRight, min: 1, max: 12 },
  { type: "table", label: "Table", icon: List, min: 1, max: 16 },
];
const WINDOWS: WidgetWindow[] = ["live", "1h", "8h", "24h", "7d"];
const WIDTHS = [
  { w: 3, label: "¼" }, { w: 4, label: "⅓" }, { w: 6, label: "½" }, { w: 8, label: "⅔" }, { w: 12, label: "Full" },
];
const HEADER_H = 46;

type Edge = "e" | "s" | "se";
interface Gesture {
  id: string;
  mode: "move" | Edge;
  start: Widget[];
  origin: { left: number; top: number; width: number; height: number };
  grab: { x: number; y: number };
  pointer: { x: number; y: number };
  live: boolean;
}

export function DashboardGrid({ widgets, data, focusId, fresh, onCommit, onPatch, onRemove, onDuplicate, onAsk }: {
  widgets: Widget[];
  data: BoardData;
  focusId: string | null;
  fresh: Set<string>;
  onCommit: (next: Widget[]) => void;
  onPatch: (id: string, patch: Partial<Widget>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAsk: (id: string) => void;
}) {
  const [wrapRef, { w: width }] = useSize<HTMLDivElement>();
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [preview, setPreview] = useState<Widget[] | null>(null);
  const g = useRef<Gesture | null>(null);
  const previewRef = useRef<Widget[] | null>(null);

  const colW = (width - GAP * (COLS - 1)) / COLS;
  const px = (b: Box) => ({
    left: b.x * (colW + GAP),
    top: b.y * (ROW_H + GAP),
    width: b.w * colW + (b.w - 1) * GAP,
    height: b.h * ROW_H + (b.h - 1) * GAP,
  });
  const stacked = width > 0 && width < 640;
  const layout = preview ?? widgets;

  useEffect(() => {
    if (!gesture) return;
    const wrap = wrapRef.current;
    const scroller = wrap?.closest(".wafer-scroll") as HTMLElement | null;

    const onMove = (e: PointerEvent) => {
      const cur = g.current;
      if (!cur || !wrap) return;
      if (!cur.live && Math.hypot(e.clientX - cur.pointer.x, e.clientY - cur.pointer.y) < 4) return;
      cur.live = true;
      const rect = wrap.getBoundingClientRect();
      const item = cur.start.find((i) => i.id === cur.id)!;
      let box: Box;
      let free: Gesture["origin"];
      if (cur.mode === "move") {
        const left = e.clientX - rect.left - cur.grab.x;
        const top = e.clientY - rect.top - cur.grab.y;
        free = { ...cur.origin, left, top };
        box = { x: Math.round(left / (colW + GAP)), y: Math.round(top / (ROW_H + GAP)), w: item.w, h: item.h };
      } else {
        const min = MIN[item.type];
        const wPx = cur.mode === "s" ? cur.origin.width : Math.max(min.w * colW, e.clientX - rect.left - cur.origin.left);
        const hPx = cur.mode === "e" ? cur.origin.height : Math.max(min.h * ROW_H, e.clientY - rect.top - cur.origin.top);
        free = { ...cur.origin, width: Math.min(wPx, width - cur.origin.left), height: hPx };
        box = {
          x: item.x, y: item.y,
          w: Math.max(min.w, Math.min(COLS - item.x, Math.round((wPx + GAP) / (colW + GAP)))),
          h: Math.max(min.h, Math.round((hPx + GAP) / (ROW_H + GAP))),
        };
      }
      const next = arrange(cur.start, cur.id, box);
      previewRef.current = next;
      setPreview(next);
      setGesture({ ...cur, origin: free });

      // Keep the board scrolling under a drag near the top or bottom edge.
      if (scroller) {
        const s = scroller.getBoundingClientRect();
        if (e.clientY > s.bottom - 56) scroller.scrollBy({ top: 14 });
        else if (e.clientY < s.top + 56) scroller.scrollBy({ top: -14 });
      }
    };
    const onUp = () => {
      const next = previewRef.current;
      if (g.current?.live && next) onCommit(next);
      g.current = null;
      previewRef.current = null;
      setGesture(null);
      setPreview(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // Listeners live for the whole gesture; `gesture` only toggles them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture !== null, colW, width]);

  const begin = (e: RPointerEvent, w: Widget, mode: Gesture["mode"]) => {
    if (stacked || e.button !== 0) return;
    if (mode === "move" && (e.target as HTMLElement).closest("button:not([data-grip]), input, [data-nodrag]")) return;
    e.preventDefault();
    const rect = wrapRef.current!.getBoundingClientRect();
    const origin = px(w);
    const cur: Gesture = {
      id: w.id, mode, start: widgets, origin,
      grab: { x: e.clientX - rect.left - origin.left, y: e.clientY - rect.top - origin.top },
      pointer: { x: e.clientX, y: e.clientY },
      live: false,
    };
    g.current = cur;
    setGesture(cur);
    document.body.style.cursor = mode === "move" ? "grabbing" : mode === "e" ? "ew-resize" : mode === "s" ? "ns-resize" : "nwse-resize";
    document.body.style.userSelect = "none";
  };

  // Arrows move a card one cell; shift+arrows resize it.
  const onKey = (e: KeyboardEvent, w: Widget) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const min = MIN[w.type];
    const box = e.shiftKey
      ? { x: w.x, y: w.y, w: Math.max(min.w, w.w + d[0]), h: Math.max(min.h, w.h + d[1]) }
      : { x: w.x + d[0], y: w.y + d[1], w: w.w, h: w.h };
    onCommit(arrange(widgets, w.id, box));
  };

  if (stacked) {
    const order = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
    return (
      <div ref={wrapRef} className="flex flex-col" style={{ gap: GAP }}>
        {order.map((w) => (
          <Card key={w.id} w={w} data={data} style={{ height: Math.max(200, Math.min(420, w.h * ROW_H + (w.h - 1) * GAP)) }}
            focused={focusId === w.id} fresh={fresh.has(w.id)} stacked
            onPatch={onPatch} onRemove={onRemove} onDuplicate={onDuplicate} onAsk={onAsk} />
        ))}
      </div>
    );
  }

  const active = gesture?.live ? gesture : null;
  const slot = active ? layout.find((i) => i.id === active.id) : null;
  const height = Math.max(0, bottom(layout) * (ROW_H + GAP) - GAP) + (active ? ROW_H * 2 : 0);

  return (
    <div ref={wrapRef} className="relative" style={{ height }}>
      {slot && <div className="dash-slot" style={{ ...px(slot), position: "absolute" }} />}
      {width > 0 && layout.map((w) => {
        const moving = active?.id === w.id;
        const box = moving ? active.origin : px(w);
        return (
          <Card
            key={w.id}
            w={w}
            data={data}
            focused={focusId === w.id}
            fresh={fresh.has(w.id)}
            dragging={moving}
            style={{
              position: "absolute",
              width: box.width,
              height: box.height,
              transform: `translate3d(${box.left}px, ${box.top}px, 0)`,
              zIndex: moving ? 30 : undefined,
            }}
            onHeaderDown={(e) => begin(e, w, "move")}
            onEdgeDown={(e, edge) => begin(e, w, edge)}
            onKey={(e) => onKey(e, w)}
            onPatch={onPatch}
            onRemove={onRemove}
            onDuplicate={onDuplicate}
            onAsk={onAsk}
          />
        );
      })}
    </div>
  );
}

function Card({ w, data, style, focused, fresh, dragging, stacked, onHeaderDown, onEdgeDown, onKey, onPatch, onRemove, onDuplicate, onAsk }: {
  w: Widget;
  data: BoardData;
  style: React.CSSProperties;
  focused: boolean;
  fresh: boolean;
  dragging?: boolean;
  stacked?: boolean;
  onHeaderDown?: (e: RPointerEvent) => void;
  onEdgeDown?: (e: RPointerEvent, edge: Edge) => void;
  onKey?: (e: KeyboardEvent) => void;
  onPatch: (id: string, patch: Partial<Widget>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAsk: (id: string) => void;
}) {
  const [bodyRef, size] = useSize<HTMLDivElement>();
  const [menu, setMenu] = useState<null | "down" | "up">(null);
  const [renaming, setRenaming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | globalThis.KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  const n = w.metrics?.length ?? 0;
  const views = n ? VIEWS.filter((v) => n >= v.min && n <= v.max) : [];
  const setType = (type: WidgetType) => {
    const min = MIN[type];
    onPatch(w.id, { type, w: Math.max(w.w, min.w), h: Math.max(w.h, min.h), ...(type === "line" && !w.window ? { window: "live" } : {}) });
  };
  const showWindow = w.type === "line" && size.w > 340;

  return (
    <article
      aria-label={w.title}
      data-widget={w.id}
      className={`dash-card group ${dragging ? "dash-card--lifted" : ""} ${fresh ? "dash-card--fresh" : ""} ${focused ? "dash-card--focus" : ""} ${menu ? "z-40" : ""}`}
      style={style}
    >
      <header
        className={`flex shrink-0 items-center gap-1.5 pl-2 pr-2 ${stacked ? "" : "cursor-grab active:cursor-grabbing"}`}
        style={{ height: HEADER_H }}
        onPointerDown={onHeaderDown}
      >
        {!stacked && (
          <button
            type="button"
            aria-label={`Move ${w.title}. Arrow keys move, shift and arrow keys resize.`}
            data-grip
            onKeyDown={onKey}
            className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-white/25 transition-colors hover:text-white/70 active:cursor-grabbing"
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
        )}
        {renaming ? (
          <input
            autoFocus
            defaultValue={w.title}
            data-nodrag
            aria-label="Widget title"
            onBlur={(e) => {
              setRenaming(false);
              const t = e.target.value.trim();
              if (t && t !== w.title) onPatch(w.id, { title: t.slice(0, 60) });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="min-w-0 flex-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[13.5px] font-semibold text-white outline-none"
          />
        ) : (
          <h3
            className={`min-w-0 truncate text-[13.5px] font-semibold tracking-tight text-white/90 ${stacked ? "pl-2" : ""}`}
            onDoubleClick={() => setRenaming(true)}
            title="Double-click to rename"
          >
            {w.title}
          </h3>
        )}
        {w.type === "line" && !showWindow && (
          <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-white/55">
            {w.window === "live" || !w.window ? "Live" : w.window}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {showWindow && (
            <div data-nodrag className="mr-1 flex rounded-full bg-white/[0.06] p-0.5" role="radiogroup" aria-label="Time window">
              {WINDOWS.map((win) => {
                const on = (w.window ?? "live") === win;
                return (
                  <button
                    key={win}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onPatch(w.id, { window: win })}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${on ? "bg-white text-black" : "text-white/50 hover:text-white"}`}
                  >
                    {win === "live" ? "Live" : win}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => onAsk(w.id)}
            aria-label={`Ask AI to change ${w.title}`}
            title="Ask AI to change this"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 opacity-0 transition-all hover:bg-white/10 hover:text-white focus:opacity-100 group-hover:opacity-100"
          >
            <Sparkles size={14} aria-hidden="true" />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                // Open upward when the card sits low, so the menu never runs under the dock.
                const r = e.currentTarget.getBoundingClientRect();
                setMenu((m) => (m ? null : r.bottom + 440 > window.innerHeight && r.top > 440 ? "up" : "down"));
              }}
              aria-label={`Options for ${w.title}`}
              aria-expanded={!!menu}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:bg-white/10 hover:text-white focus:opacity-100 group-hover:opacity-100 ${menu ? "bg-white/10 text-white opacity-100" : "text-white/40 opacity-0"} ${stacked ? "opacity-100" : ""}`}
            >
              <MoreHorizontal size={15} aria-hidden="true" />
            </button>
            {menu && (
              <div className={`dash-menu absolute right-0 z-50 w-[248px] p-1.5 ${menu === "up" ? "bottom-8" : "top-8"}`} role="menu">
                <button type="button" role="menuitem" className="dash-menu-item" onClick={() => { setMenu(null); onAsk(w.id); }}>
                  <Sparkles size={14} aria-hidden="true" /> Ask AI to change…
                </button>
                {views.length > 1 && (
                  <>
                    <div className="dash-menu-label">Show as</div>
                    <div className="grid grid-cols-4 gap-1 px-1 pb-1">
                      {views.map((v) => (
                        <button
                          key={v.type}
                          type="button"
                          onClick={() => setType(v.type)}
                          aria-pressed={w.type === v.type}
                          className={`flex flex-col items-center gap-1 rounded-lg py-1.5 text-[10.5px] font-medium transition-colors ${w.type === v.type ? "bg-white text-black" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
                        >
                          <v.icon size={15} aria-hidden="true" />
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {w.type === "line" && (
                  <>
                    <div className="dash-menu-label">Time window</div>
                    <div className="flex gap-1 px-1 pb-1">
                      {WINDOWS.map((win) => (
                        <button key={win} type="button" onClick={() => onPatch(w.id, { window: win })}
                          className={`flex-1 rounded-lg py-1 text-[11.5px] font-semibold ${(w.window ?? "live") === win ? "bg-white text-black" : "text-white/60 hover:bg-white/10 hover:text-white"}`}>
                          {win === "live" ? "Live" : win}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {!stacked && (
                  <>
                    <div className="dash-menu-label">Width</div>
                    <div className="flex gap-1 px-1 pb-1">
                      {WIDTHS.filter((o) => o.w >= MIN[w.type].w).map((o) => (
                        <button key={o.w} type="button" onClick={() => onPatch(w.id, { w: o.w, x: Math.min(w.x, COLS - o.w) })}
                          className={`flex-1 rounded-lg py-1 text-[11.5px] font-semibold ${w.w === o.w ? "bg-white text-black" : "text-white/60 hover:bg-white/10 hover:text-white"}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="my-1 h-px bg-white/[0.08]" />
                <button type="button" role="menuitem" className="dash-menu-item" onClick={() => { setMenu(null); setRenaming(true); }}>
                  <span className="w-[14px] text-center text-[13px] font-semibold" aria-hidden="true">T</span> Rename
                </button>
                <button type="button" role="menuitem" className="dash-menu-item" onClick={() => { setMenu(null); onDuplicate(w.id); }}>
                  <Copy size={14} aria-hidden="true" /> Duplicate
                </button>
                <button type="button" role="menuitem" className="dash-menu-item text-[#ff9a9a] hover:!text-[#ffb4b4]" onClick={() => { setMenu(null); onRemove(w.id); }}>
                  <Trash2 size={14} aria-hidden="true" /> Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div ref={bodyRef} className="min-h-0 flex-1 px-4 pb-4">
        <WidgetBody widget={w} data={data} width={size.w} height={size.h} />
      </div>

      {!stacked && onEdgeDown && (
        <>
          <span aria-hidden="true" className="dash-edge dash-edge--e" onPointerDown={(e) => onEdgeDown(e, "e")} />
          <span aria-hidden="true" className="dash-edge dash-edge--s" onPointerDown={(e) => onEdgeDown(e, "s")} />
          <span aria-hidden="true" className="dash-edge dash-edge--se" onPointerDown={(e) => onEdgeDown(e, "se")}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M9 3v6H3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </>
      )}
    </article>
  );
}

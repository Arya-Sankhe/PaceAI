// A 12-column packing grid. Items are pushed down out of each other's way and
// then float up to fill gaps, so any drag or resize lands on a tidy board.
import type { PlannerWidget, Widget, WidgetType } from "@/lib/api";

export const COLS = 12;
export const ROW_H = 44;
export const GAP = 14;

export interface Box { x: number; y: number; w: number; h: number; }
type Item = Box & { id: string };

export const MIN: Record<WidgetType, { w: number; h: number }> = {
  stat: { w: 2, h: 3 }, gauge: { w: 3, h: 4 }, line: { w: 3, h: 4 }, bars: { w: 3, h: 3 },
  split: { w: 3, h: 4 }, status: { w: 2, h: 3 }, table: { w: 4, h: 3 },
  heaters: { w: 4, h: 4 }, drives: { w: 4, h: 4 }, events: { w: 3, h: 3 },
};

/** A new widget's footprint: what the kind needs, nudged by the planner's size hint. */
export function defaultSize(w: PlannerWidget): { w: number; h: number } {
  const n = w.metrics?.length ?? 0;
  const base: Record<WidgetType, { w: number; h: number }> = {
    stat: { w: Math.min(COLS, Math.max(3, 3 * n)), h: 4 },
    gauge: { w: 3, h: 5 },
    line: { w: 6, h: 7 },
    bars: { w: 6, h: Math.min(10, 2 + Math.ceil(n * 0.75)) },
    split: { w: 4, h: 6 },
    status: { w: Math.min(COLS, n > 4 ? 6 : 4), h: Math.min(8, 2 + Math.ceil(n / (n > 4 ? 3 : 2))) },
    table: { w: 6, h: Math.min(10, 2 + Math.ceil(n * 0.8)) },
    heaters: { w: 12, h: 5 },
    drives: { w: 8, h: 7 },
    events: { w: 4, h: 7 },
  };
  const size = { ...base[w.type] };
  if (w.size === "s") size.w = Math.max(3, MIN[w.type].w, Math.round(size.w * 0.66));
  if (w.size === "l") size.w = Math.min(COLS, Math.round(size.w * 1.5));
  if (w.size === "wide") size.w = COLS;
  return size;
}

export const collides = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const bottom = (items: Box[]) => items.reduce((m, i) => Math.max(m, i.y + i.h), 0);

/** Float everything up as far as it goes. `first` wins ties, so the item being
 *  dragged keeps the spot the pointer is over. */
export function compact<T extends Item>(items: T[], first?: string): T[] {
  const order = [...items].sort((a, b) =>
    a.y - b.y || (a.id === first ? -1 : b.id === first ? 1 : a.x - b.x),
  );
  const placed: T[] = [];
  for (const it of order) {
    let y = it.y;
    while (y > 0 && !placed.some((p) => collides({ ...it, y: y - 1 }, p))) y -= 1;
    while (placed.some((p) => collides({ ...it, y }, p))) y += 1;
    placed.push({ ...it, y });
  }
  return items.map((it) => placed.find((p) => p.id === it.id)!);
}

function pushDown<T extends Item>(items: T[], moved: T) {
  const hit = items
    .filter((o) => o.id !== moved.id && collides(o, moved))
    .sort((a, b) => a.y - b.y);
  for (const o of hit) {
    o.y = moved.y + moved.h;
    pushDown(items, o);
  }
}

/** Put `id` at (x, y) with size (w, h), make room, repack. Always from the
 *  layout at gesture start, so a long drag never accumulates drift. */
export function arrange<T extends Item>(start: T[], id: string, box: Box): T[] {
  const items = start.map((i) => ({ ...i }));
  const it = items.find((i) => i.id === id);
  if (!it) return start;
  it.w = Math.max(1, Math.min(COLS, box.w));
  it.h = Math.max(1, box.h);
  it.x = Math.max(0, Math.min(COLS - it.w, box.x));
  it.y = Math.max(0, box.y);
  pushDown(items, it);
  return compact(items, id);
}

/** First free spot, scanning top-left to bottom-right. */
export function place(items: Box[], w: number, h: number): { x: number; y: number } {
  const width = Math.min(COLS, w);
  for (let y = 0; y <= bottom(items); y += 1) {
    for (let x = 0; x + width <= COLS; x += 1) {
      if (!items.some((o) => collides({ x, y, w: width, h }, o))) return { x, y };
    }
  }
  return { x: 0, y: bottom(items) };
}

let seq = 0;
export const newId = () => `w${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Lay planner widgets onto the board around what is already there. */
export function addWidgets(existing: Widget[], incoming: PlannerWidget[]): Widget[] {
  const out = [...existing];
  for (const p of incoming) {
    const { w, h } = defaultSize(p);
    const { x, y } = place(out, w, h);
    out.push({ ...p, id: newId(), x, y, w: Math.min(COLS, w), h });
  }
  return out;
}

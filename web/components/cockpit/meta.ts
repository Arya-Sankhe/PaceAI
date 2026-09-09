export const HEATERS = [
  { prefix: "hor_front", label: "Horizontal Front" },
  { prefix: "hor_rear", label: "Horizontal Rear" },
  { prefix: "vert1", label: "Vertical 1" },
  { prefix: "vert2", label: "Vertical 2" },
] as const;

export const AXES = [
  { prefix: "bx", label: "Box Forming", hasPos: true },
  { prefix: "cs", label: "Cross Seal", hasPos: false },
  { prefix: "ff", label: "Film Feed", hasPos: false },
  { prefix: "pk", label: "Poker", hasPos: true },
  { prefix: "uw", label: "Unwind", hasPos: false },
  { prefix: "vs", label: "Vertical Seal", hasPos: true },
] as const;

export const UTIL_LABELS = [
  "Channel 1", "Channel 2", "Channel 3", "Channel 4", "Channel 5", "Channel 6", "Channel 7",
];

export const MACHINES = [
  { key: "orion_1", name: "Orion VFFS #1", short: "Machine 1" },
  { key: "orion_2", name: "Orion VFFS #2", short: "Machine 2" },
] as const;

export function num(values: Record<string, number>, key: string): number | undefined {
  const v = values[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function on(values: Record<string, number>, key: string): boolean | undefined {
  const v = num(values, key);
  return v == null ? undefined : v !== 0;
}

export function fmtHms(sec: number | undefined): string {
  if (sec == null) return "—";
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, "0")} : ${String(m).padStart(2, "0")} : ${String(r).padStart(2, "0")}`;
}

export function fmtShift(sec: number | undefined): string {
  if (sec == null) return "—";
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(r).padStart(2, "0")}s`;
}

export function fmtNum(v: number | undefined, digits = 1): string {
  return v == null ? "—" : v.toFixed(digits);
}



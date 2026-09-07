export const HEATERS = [
  { prefix: "hor_front", label: "Horizontal Front" },
  { prefix: "hor_rear", label: "Horizontal Rear" },
  { prefix: "ver1", label: "Vertical 1" },
  { prefix: "ver2", label: "Vertical 2" },
] as const;

export const AXES = [
  { prefix: "bx", label: "Box Forming" },
  { prefix: "cs", label: "Cross Seal" },
  { prefix: "ff", label: "Film Feed" },
  { prefix: "pk", label: "Poker" },
  { prefix: "uw", label: "Unwind" },
  { prefix: "vs", label: "Vertical Seal" },
] as const;

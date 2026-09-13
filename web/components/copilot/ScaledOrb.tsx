"use client";

import { useEffect, useRef } from "react";
import { MODE_DRAWS, resolvePreset, type OrbSize, type OrbState } from "thinking-orbs/engine";

// The library's presets are hand-tuned at exactly 64 and 20 CSS px, and its own
// component caps the canvas raster at 2 device pixels — so asking it for
// anything larger just stretches a bitmap. Instead we draw the tuned geometry
// for the given base size through a scaled context: identical design, no
// retuning of the internal count/radius knobs, and rasterised at the final
// device resolution so it stays crisp at any size.
const MAX_DPR = 3;

export function ScaledOrb({
  state,
  size = 64,
  scale = 1,
}: {
  state: OrbState;
  size?: OrbSize;
  scale?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const px = size * scale;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(MAX_DPR, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    canvas.width = Math.round(px * dpr);
    canvas.height = Math.round(px * dpr);

    const { mode, speed, opts } = resolvePreset(state, size);
    const draw = MODE_DRAWS[mode];

    const render = (t: number) => {
      const k = scale * dpr;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, size, size);
      draw(ctx, size, t * speed, true, opts);
    };

    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      render(0.6);
      return;
    }

    let raf = 0;
    const tick = () => {
      render(performance.now() / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, size, scale]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ width: px, height: px, display: "block" }}
    />
  );
}

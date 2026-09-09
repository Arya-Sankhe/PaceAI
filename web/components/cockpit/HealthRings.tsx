// Compact target-measured visuals (ui-ux-pro-max gauge/bullet idiom):
// the value is always paired with text — color is never the only signal.

export function Ring({ value, max, label }: { value: number; max: number; label: string }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="flex items-center gap-3">
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${label}: ${value} of ${max}`}>
        <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="7" />
        <circle cx="32" cy="32" r={R} fill="none" stroke="#1d1d1f" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 32 32)" />
        <text x="32" y="32" textAnchor="middle" dominantBaseline="central"
          fontSize="14" fontWeight="600" fill="#1d1d1f" style={{ fontVariantNumeric: "tabular-nums" }}>
          {value}/{max}
        </text>
      </svg>
      <span className="text-[12.5px] leading-snug text-[#6e6e73]">{label}</span>
    </div>
  );
}

export function DeviationBullet({ delta }: { delta: number | undefined }) {
  // Worst zone deviation against a ±10° window; shaded ±2° tolerance band,
  // center tick = setpoint. Dot is red outside tolerance, ink inside.
  const RANGE = 10, TOL = 2;
  const W = 220, H = 34, PAD = 6;
  const X = (d: number) => PAD + ((Math.max(-RANGE, Math.min(RANGE, d)) + RANGE) / (2 * RANGE)) * (W - 2 * PAD);
  const outside = delta != null && Math.abs(delta) > TOL;
  const label = delta == null ? "Deviation unknown" : `Largest deviation ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}°`;
  return (
    <div className="flex items-center gap-3" role="img" aria-label={label}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0">
        <rect x={X(-TOL)} y={H / 2 - 7} width={X(TOL) - X(-TOL)} height={14} rx="7" fill="rgba(0,0,0,0.06)" />
        <line x1={X(0)} x2={X(0)} y1={H / 2 - 10} y2={H / 2 + 10} stroke="#1d1d1f" strokeWidth="2" />
        {delta != null && (
          <circle cx={X(delta)} cy={H / 2} r="6" fill={outside ? "#d70015" : "#1d1d1f"} stroke="#fff" strokeWidth="2" />
        )}
      </svg>
      <span className="text-[12.5px] leading-snug text-[#6e6e73]">
        Largest deviation
        <span className={`block text-[14px] font-semibold tabular ${outside ? "text-[#d70015]" : "text-[#1d1d1f]"}`}>
          {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}°`}
        </span>
      </span>
    </div>
  );
}

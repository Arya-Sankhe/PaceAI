/** Flat 2D line-art of a VFFS machine: film roll → forming collar → tube →
 *  seal jaws → finished bag, plus the control cabinet with HMI + stack lamp.
 *  The accent (HMI screen, lamp) follows the machine's live status tone. */
export function VffsArt({ tone = "muted" }: { tone?: "ok" | "bad" | "muted" }) {
  const accent = tone === "ok" ? "#34d399" : tone === "bad" ? "#ff5d5d" : "rgba(255,255,255,0.55)";
  const line = "rgba(255,255,255,0.30)";
  const faint = "rgba(255,255,255,0.14)";

  return (
    <svg
      viewBox="0 0 220 180"
      className="h-[148px] w-auto sm:h-[164px]"
      role="img"
      aria-label="Illustration of a vertical form-fill-seal machine"
      style={{ animation: "float-y 7s ease-in-out infinite" }}
    >
      <g fill="none" stroke={line} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* gantry beam + hangers */}
        <line x1="44" y1="22" x2="150" y2="22" />
        <line x1="52" y1="22" x2="52" y2="32" />
        <line x1="150" y1="22" x2="150" y2="34" />

        {/* film roll */}
        <circle cx="52" cy="56" r="24" />
        <circle cx="52" cy="56" r="15" stroke={faint} />
        <circle cx="52" cy="56" r="5" fill="rgba(255,255,255,0.14)" />

        {/* web path over roller down to the collar */}
        <line x1="76" y1="56" x2="95" y2="56" />
        <circle cx="100" cy="56" r="4.5" />
        <path d="M104 58 C 110 72, 113 80, 118 86" />

        {/* forming collar + tube */}
        <path d="M104 84 H134 L125 102 H113 Z" fill="rgba(255,255,255,0.05)" />
        <rect x="113" y="102" width="12" height="30" />

        {/* seal jaws */}
        <rect x="95" y="127" width="18" height="7" rx="3.5" />
        <rect x="125" y="127" width="14" height="7" rx="3.5" />

        {/* finished bag */}
        <rect x="107" y="141" width="14" height="19" rx="4" />
        <line x1="107" y1="146.5" x2="121" y2="146.5" stroke={faint} strokeWidth="1.5" />
        <line x1="107" y1="150.5" x2="121" y2="150.5" stroke={faint} strokeWidth="1.5" />

        {/* control cabinet */}
        <rect x="140" y="34" width="56" height="118" rx="12" fill="rgba(255,255,255,0.05)" />
        <line x1="149" y1="46" x2="149" y2="140" stroke={faint} />

        {/* HMI */}
        <rect x="156" y="48" width="32" height="26" rx="5" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.22)" />
        <rect x="160" y="52" width="24" height="13" rx="2" fill={accent} opacity="0.35" stroke="none" />
        <circle cx="165" cy="70" r="1.6" fill="rgba(255,255,255,0.45)" stroke="none" />
        <circle cx="171" cy="70" r="1.6" fill="rgba(255,255,255,0.45)" stroke="none" />

        {/* lamp pole */}
        <line x1="168" y1="34" x2="168" y2="26" />

        {/* feet + floor */}
        <line x1="148" y1="152" x2="148" y2="160" />
        <line x1="188" y1="152" x2="188" y2="160" />
        <line x1="28" y1="162" x2="196" y2="162" stroke={faint} />
      </g>

      {/* stack lamp + halo (accent follows status) */}
      <circle cx="168" cy="19" r="9" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5" className="stream-pulse" />
      <circle cx="168" cy="19" r="5" fill={accent} />
    </svg>
  );
}

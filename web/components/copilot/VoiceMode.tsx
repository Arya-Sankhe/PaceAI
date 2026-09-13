"use client";

import { X } from "lucide-react";
import type { OrbState } from "thinking-orbs";
import { ScaledOrb } from "@/components/copilot/ScaledOrb";
import type { VoicePhase } from "@/hooks/useVoiceAgent";

const HINT: Record<VoicePhase, string> = {
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Working",
};

// 2x the 160px orb shown on the empty state.
const ORB_SCALE = 5;

export function VoiceMode({
  phase,
  orb,
  caption,
  closing,
  onClose,
}: {
  phase: VoicePhase;
  orb: OrbState;
  caption: string;
  closing: boolean;
  onClose: () => void;
}) {
  return (
    <div className={`voice-layer${closing ? " voice-layer--out" : ""}`}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Exit voice mode"
        className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition-colors hover:border-white/25 hover:text-white"
      >
        <X size={18} aria-hidden="true" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 px-8">
        {/* Mounted at full size and animated from scale 0.5, so the grow never
            upscales the canvas: a 320px bitmap shown at 160px stays crisp. */}
        <div className="voice-orb">
          <ScaledOrb state={orb} size={64} scale={ORB_SCALE} />
        </div>

        <div className="max-w-[54ch] text-center">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-white/35">{HINT[phase]}</p>
          {caption && <p className="mt-2.5 text-[14px] leading-relaxed text-white/60">{caption}</p>}
        </div>
      </div>
    </div>
  );
}

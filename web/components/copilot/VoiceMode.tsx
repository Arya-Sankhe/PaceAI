"use client";

import { Mic, X } from "lucide-react";
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
  onSpeakAgain,
  onClose,
}: {
  phase: VoicePhase;
  orb: OrbState;
  caption: string;
  closing: boolean;
  // Offered once the question is sent: abandon it and speak again.
  onSpeakAgain: (() => void) | null;
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

        {/* Reserved height so the orb never jumps when the button appears. */}
        <div className="flex h-[88px] items-start justify-center">
          {onSpeakAgain && (
            <button
              type="button"
              onClick={onSpeakAgain}
              className="voice-turn group flex flex-col items-center gap-2 text-[12px] font-medium text-white/55 transition-colors hover:text-white"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-white shadow-[0_0_0_6px_rgba(255,255,255,0.03)] transition-all group-hover:scale-105 group-hover:border-white/35 group-hover:bg-white/[0.12] group-active:scale-95">
                <Mic size={22} aria-hidden="true" />
              </span>
              Speak again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

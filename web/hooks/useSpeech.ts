"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speakTexts } from "@/lib/voice";

// Owns the spoken-output queue. It deliberately lives above the voice overlay:
// the summary has to keep playing after that overlay closes and the chat takes
// over, so tearing the overlay down must not abort the audio.
export function useSpeech() {
  const [playing, setPlaying] = useState(false);
  const [caption, setCaption] = useState("");
  // Set when the browser refuses to play the audio, so the UI can say so
  // instead of going quiet for no visible reason.
  const [blocked, setBlocked] = useState(false);
  // Entries already appended to the chain cannot be cancelled, so each checks a
  // generation counter and no-ops once superseded.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const pending = useRef(0);

  const say = useCallback((texts: string[], preempt = false) => {
    if (preempt) {
      generation.current += 1;
      controller.current?.abort();
    }
    const gen = generation.current;
    const next = new AbortController();
    pending.current += 1;
    setPlaying(true);
    setBlocked(false);
    chain.current = chain.current
      .then(() => {
        if (gen !== generation.current) return;
        controller.current = next;
        return speakTexts(texts, {
          signal: next.signal,
          onCaption: setCaption,
          onFailure: () => setBlocked(true),
        });
      })
      .catch(() => {})
      .finally(() => {
        pending.current -= 1;
        if (pending.current <= 0) {
          pending.current = 0;
          setPlaying(false);
        }
      });
    return chain.current;
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    pending.current = 0;
    setPlaying(false);
    setCaption("");
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  return { say, stop, playing, caption, blocked };
}

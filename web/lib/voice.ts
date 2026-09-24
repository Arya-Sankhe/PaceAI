import type { Diagnosis } from "@/hooks/useCopilotStream";
import type { OrbState } from "thinking-orbs";
import { demoMode } from "@/lib/api";
import { supabase } from "@/lib/supabase";

// Spoken filler while a diagnosis runs. These mirror the SSE steps the API
// already emits, so reassuring the user costs no extra model call. Localized
// to the eleven languages Bulbul speaks; anything else gets the English set.
export type VoiceChrome = {
  ack: string;
  steps: Record<string, string>;
  working: string;
  error: string;
};

const ENGLISH: VoiceChrome = {
  ack: "Got it. Working on that now.",
  steps: {
    "reading telemetry": "Pulling up the live machine data.",
    "retrieving manuals": "Going through the manuals.",
    generating: "Working out the diagnosis.",
  },
  working: "Still working on that.",
  error: "Sorry, that diagnosis did not come through. Let's try that again.",
};

// Keep these keys in sync with SPEAKABLE in backend/app/core/language.py.
const CHROME: Record<string, VoiceChrome> = {
  "en-IN": ENGLISH,
  "hi-IN": {
    ack: "समझ गया। अभी देखता हूँ।",
    steps: {
      "reading telemetry": "मशीन का लाइव डेटा निकाल रहा हूँ।",
      "retrieving manuals": "मैनुअल देख रहा हूँ।",
      generating: "निदान तैयार कर रहा हूँ।",
    },
    working: "अभी भी काम चल रहा है।",
    error: "माफ़ कीजिए, निदान नहीं आ पाया। दोबारा कोशिश करते हैं।",
  },
  "mr-IN": {
    ack: "समजलं. आता पाहतोय.",
    steps: {
      "reading telemetry": "मशीनचा लाईव्ह डेटा काढतोय.",
      "retrieving manuals": "मॅन्युअल पाहतोय.",
      generating: "निदान तयार करतोय.",
    },
    working: "अजून चालू आहे.",
    error: "माफ करा, निदान मिळालं नाही. परत प्रयत्न करूया.",
  },
  "bn-IN": {
    ack: "বুঝেছি। এখনই দেখছি।",
    steps: {
      "reading telemetry": "মেশিনের লাইভ ডেটা বের করছি।",
      "retrieving manuals": "ম্যানুয়াল দেখছি।",
      generating: "নির্ণয় তৈরি করছি।",
    },
    working: "এখনও চলছে।",
    error: "দুঃখিত, নির্ণয় আসেনি। আবার চেষ্টা করি।",
  },
  "ta-IN": {
    ack: "புரிந்தது. இப்போது பார்க்கிறேன்.",
    steps: {
      "reading telemetry": "இயந்திரத்தின் நேரடி தரவை எடுக்கிறேன்.",
      "retrieving manuals": "கையேட்டைப் பார்க்கிறேன்.",
      generating: "கண்டறிதலைத் தயார் செய்கிறேன்.",
    },
    working: "இன்னும் நடந்து கொண்டிருக்கிறது.",
    error: "மன்னிக்கவும், கண்டறிதல் வரவில்லை. மீண்டும் முயற்சிப்போம்.",
  },
  "te-IN": {
    ack: "అర్థమైంది. ఇప్పుడే చూస్తున్నాను.",
    steps: {
      "reading telemetry": "యంత్రం లైవ్ డేటా తీసుకుంటున్నాను.",
      "retrieving manuals": "మాన్యువల్ చూస్తున్నాను.",
      generating: "నిర్ధారణ సిద్ధం చేస్తున్నాను.",
    },
    working: "ఇంకా జరుగుతోంది.",
    error: "క్షమించండి, నిర్ధారణ రాలేదు. మళ్లీ ప్రయత్నిద్దాం.",
  },
  "kn-IN": {
    ack: "ಅರ್ಥವಾಯಿತು. ಈಗ ನೋಡುತ್ತಿದ್ದೇನೆ.",
    steps: {
      "reading telemetry": "ಯಂತ್ರದ ಲೈವ್ ಡೇಟಾ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದ್ದೇನೆ.",
      "retrieving manuals": "ಕೈಪಿಡಿ ನೋಡುತ್ತಿದ್ದೇನೆ.",
      generating: "ರೋಗನಿರ್ಣಯ ಸಿದ್ಧಪಡಿಸುತ್ತಿದ್ದೇನೆ.",
    },
    working: "ಇನ್ನೂ ನಡೆಯುತ್ತಿದೆ.",
    error: "ಕ್ಷಮಿಸಿ, ರೋಗನಿರ್ಣಯ ಬಂದಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸೋಣ.",
  },
  "ml-IN": {
    ack: "മനസ്സിലായി. ഇപ്പോൾ നോക്കുന്നു.",
    steps: {
      "reading telemetry": "മെഷീന്റെ തത്സമയ ഡാറ്റ എടുക്കുന്നു.",
      "retrieving manuals": "മാനുവൽ നോക്കുന്നു.",
      generating: "രോഗനിർണയം തയ്യാറാക്കുന്നു.",
    },
    working: "ഇപ്പോഴും നടക്കുന്നു.",
    error: "ക്ഷമിക്കണം, രോഗനിർണയം വന്നില്ല. വീണ്ടും ശ്രമിക്കാം.",
  },
  "gu-IN": {
    ack: "સમજાઈ ગયું. હમણાં જોઈ રહ્યો છું.",
    steps: {
      "reading telemetry": "મશીનનો લાઇવ ડેટા કાઢી રહ્યો છું.",
      "retrieving manuals": "મેન્યુઅલ જોઈ રહ્યો છું.",
      generating: "નિદાન તૈયાર કરી રહ્યો છું.",
    },
    working: "હજી ચાલુ છે.",
    error: "માફ કરજો, નિદાન આવ્યું નથી. ફરી પ્રયત્ન કરીએ.",
  },
  "pa-IN": {
    ack: "ਸਮਝ ਗਿਆ। ਹੁਣੇ ਵੇਖ ਰਿਹਾ ਹਾਂ।",
    steps: {
      "reading telemetry": "ਮਸ਼ੀਨ ਦਾ ਲਾਈਵ ਡੇਟਾ ਕੱਢ ਰਿਹਾ ਹਾਂ।",
      "retrieving manuals": "ਮੈਨੂਅਲ ਵੇਖ ਰਿਹਾ ਹਾਂ।",
      generating: "ਜਾਂਚ ਤਿਆਰ ਕਰ ਰਿਹਾ ਹਾਂ।",
    },
    working: "ਅਜੇ ਚੱਲ ਰਿਹਾ ਹੈ।",
    error: "ਮਾਫ਼ ਕਰਨਾ, ਜਾਂਚ ਨਹੀਂ ਆਈ। ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੀਏ।",
  },
  "od-IN": {
    ack: "ବୁଝିଲି। ଏବେ ଦେଖୁଛି।",
    steps: {
      "reading telemetry": "ମେସିନର ଲାଇଭ୍ ଡାଟା ଆଣୁଛି।",
      "retrieving manuals": "ମାନୁଆଲ୍ ଦେଖୁଛି।",
      generating: "ନିର୍ଣ୍ଣୟ ପ୍ରସ୍ତୁତ କରୁଛି।",
    },
    working: "ଏବେ ବି ଚାଲିଛି।",
    error: "କ୍ଷମା କରନ୍ତୁ, ନିର୍ଣ୍ଣୟ ଆସିଲା ନାହିଁ। ପୁଣି ଚେଷ୍ଟା କରିବା।",
  },
};

// Narrows whatever the recogniser reports to a code Bulbul speaks. Sarvam's
// recogniser spells Odia "or-IN" while the synthesiser wants "od-IN".
export function ttsLanguage(code?: string): string {
  const base = (code ?? "").toLowerCase().split(/[-_]/)[0];
  const lang = base === "or" ? "od-IN" : `${base}-IN`;
  return lang in CHROME ? lang : "en-IN";
}

export function chromeFor(language?: string): VoiceChrome {
  return CHROME[ttsLanguage(language)] ?? ENGLISH;
}

export const ORB_FOR_STEP: Record<string, OrbState> = {
  "reading telemetry": "connecting",
  "retrieving manuals": "searching",
  generating: "solving",
};

// Spoken gist of the answer: the model's summary in the answer's own language,
// with the validated safety and freshness warnings always in front of it. The
// full structured detail stays on screen for the user to read.
export function spokenSummary(a: Diagnosis): string {
  // An empty language_code marks an answer Bulbul cannot speak: say nothing
  // rather than read the text in the wrong voice.
  if (a.language_code === "") return "";
  const body =
    (a.speech_summary ?? "").trim() ||
    [a.hypotheses[0]?.cause, a.next_checks[0]].filter(Boolean).join(" ");
  return [a.safety_warning, a.freshness_warning, body].filter(Boolean).join(" ");
}

// Well under the API ceiling, and short enough that the first line starts
// playing quickly while the rest is still being synthesised.
const CHUNK_CHARS = 900;

export function chunkForSpeech(text: string, limit = CHUNK_CHARS): string[] {
  const sentences = text
    .split(/(?<=[.!?।॥])\s+/)
    .flatMap((s) => (s.length > limit ? s.match(new RegExp(`.{1,${limit}}(\\s|$)`, "g")) ?? [s] : [s]));
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > limit) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function fetchSpeech(text: string, signal: AbortSignal, languageCode?: string) {
  // The API requires a bearer token outside demo mode (same as the copilot).
  const { data } = demoMode ? { data: { session: null } } : await supabase().auth.getSession();
  const res = await fetch("/api/v1/speech/speak", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    },
    body: JSON.stringify(languageCode ? { text, language_code: languageCode } : { text }),
    signal,
  });
  if (!res.ok) throw new Error("tts_failed");
  return URL.createObjectURL(await res.blob());
}

// Resolves false when the browser refused to play it, so a blocked player can
// never fail silently again.
function play(url: string, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    const audio = new Audio(url);
    const finish = (played: boolean) => {
      signal.removeEventListener("abort", stop);
      resolve(played);
    };
    const stop = () => {
      audio.pause();
      resolve(false);
    };
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    signal.addEventListener("abort", stop, { once: true });
    void audio.play().catch((err) => {
      // A blob: URL still needs media-src to permit blob:, otherwise the
      // element errors out with no sound and no visible failure.
      console.warn("[voice] playback failed:", err);
      finish(false);
    });
  });
}

// Play the lines in order, fetching the next chunk while the current one is
// still speaking so there is no silence between them.
export async function speakTexts(
  texts: string[],
  {
    signal,
    onCaption,
    onFailure,
    language,
  }: {
    signal: AbortSignal;
    onCaption?: (text: string) => void;
    onFailure?: () => void;
    language?: string;
  },
) {
  const chunks = texts.flatMap((t) => chunkForSpeech(t));
  if (!chunks.length) return;
  const urls: string[] = [];
  let reported = false;
  let pending = fetchSpeech(chunks[0], signal, language);
  try {
    for (let i = 0; i < chunks.length && !signal.aborted; i++) {
      const url = await pending;
      urls.push(url);
      if (i + 1 < chunks.length) pending = fetchSpeech(chunks[i + 1], signal, language);
      onCaption?.(chunks[i]);
      const played = await play(url, signal);
      if (!played && !signal.aborted && !reported) {
        reported = true;
        onFailure?.();
      }
    }
  } catch {
    // A failed fetch must surface like a failed playback — silence with no
    // visible reason is exactly what the failure callback exists to prevent.
    if (!signal.aborted && !reported) {
      reported = true;
      onFailure?.();
    }
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
  }
}

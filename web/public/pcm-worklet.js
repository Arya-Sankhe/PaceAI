// Captures mono microphone input as 16-bit PCM and posts ~100ms chunks to the
// main thread. Sarvam's streaming socket only accepts linear16 PCM at 16kHz —
// it rejects webm/opus, so MediaRecorder cannot be used here.
//
// Nothing is written to the output, so patching this node into the graph is
// silent even though it is connected to the destination.
const TARGET_RATE = 16000;
const CHUNK = 1600; // 100ms at 16kHz

class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    // The context usually honours new AudioContext({ sampleRate: 16000 }), but
    // that is not guaranteed. Feeding the recogniser 48kHz audio labelled as
    // 16kHz makes it hear 3x-speed speech, so resample here rather than trust
    // the context rate. With a 16kHz context this step is 1 and passes through.
    this.step = sampleRate / TARGET_RATE;
    this.tail = new Float32Array(0);
    this.cursor = 0;
    this.chunk = new Int16Array(CHUNK);
    this.filled = 0;

    // The main thread asks for the pending samples when the user stops, so the
    // last fraction of a second is sent rather than discarded with the graph.
    this.port.onmessage = (event) => {
      if (event.data && event.data.flush) this.flush();
    };
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;

    const buffer = this.tail.length ? join(this.tail, input) : input;
    let cursor = this.cursor;
    while (cursor + 1 < buffer.length) {
      const index = Math.floor(cursor);
      const frac = cursor - index;
      this.emit(buffer[index] * (1 - frac) + buffer[index + 1] * frac);
      cursor += this.step;
    }
    const consumed = Math.floor(cursor);
    this.tail = buffer.slice(consumed);
    this.cursor = cursor - consumed;
    return true;
  }

  emit(sample) {
    const clamped = Math.max(-1, Math.min(1, sample));
    this.chunk[this.filled++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    if (this.filled === CHUNK) this.post();
  }

  flush() {
    this.post();
  }

  post() {
    const out = this.chunk.slice(0, this.filled);
    this.filled = 0;
    this.port.postMessage(out.buffer, [out.buffer]);
  }
}

function join(a, b) {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

registerProcessor("pcm-capture", PcmCapture);

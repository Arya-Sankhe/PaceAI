"use client";

import { useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { api } from "@/lib/api";

export function ManualUploadModal({ onDone }: { onDone: (upload: { document_id: string; job_id: string; deduped?: boolean }) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [touchedTitle, setTouchedTitle] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null); setTitle(""); setTouchedTitle(false); setErr(""); setBusy(false);
  }

  function pick(f: File | null) {
    setFile(f);
    setErr("");
    if (f && !touchedTitle) {
      setTitle(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim());
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) { setErr("Choose a PDF file first."); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title.trim());
      const upload = await api.upload(fd);
      setOpen(false);
      reset();
      onDone(upload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upload_failed";
      setErr(
        msg === "pdf_too_large" ? "That file is over the 100MB limit."
        : msg === "not_a_pdf" ? "That doesn't look like a PDF file."
        : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13.5px] font-semibold text-black shadow-[0_8px_28px_rgba(0,0,0,0.3)] transition-transform hover:scale-[1.02] active:scale-[0.98]">
        <Upload size={15} aria-hidden="true" /> Upload manual
      </button>
    );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => { setOpen(false); reset(); }}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="black-card w-[26rem] max-w-full p-6">
        <div className="relative z-10">
          <h2 className="font-display text-[17px] font-semibold tracking-tight text-white">Upload manual</h2>
          <p className="mt-1 text-[13px] text-white/50">Pick a PDF — it starts reading on its own.</p>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/[0.04] px-4 py-5 text-left transition-colors hover:bg-white/[0.07]"
          >
            <FileUp size={20} aria-hidden="true" className="shrink-0 text-white/50" />
            <span>
              <span className="block text-[13.5px] font-semibold text-white">
                {file ? file.name : "Choose a PDF file"}
              </span>
              <span className="block text-[12.5px] tabular text-white/45">
                {file ? `${(file.size / 1048576).toFixed(1)} MB` : "Up to 100MB"}
              </span>
            </span>
          </button>
          <input
            ref={fileRef} type="file" accept=".pdf,application/pdf" required
            className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />

          <label className="mt-3 block">
            <span className="text-[12.5px] font-semibold text-white/60">Name (optional)</span>
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTouchedTitle(true); }}
              placeholder="Taken from the file name"
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/35"
            />
          </label>

          {err && <p className="mt-3 text-[13px] text-[#ff8a8a]">{err}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => { setOpen(false); reset(); }} className="px-3 py-2 text-sm text-white/60 hover:text-white">Cancel</button>
            <button disabled={busy || !file} className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black disabled:opacity-40">
              {busy ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

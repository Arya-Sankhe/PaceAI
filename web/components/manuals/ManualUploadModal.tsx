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
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-full bg-[#1d1d1f] px-4 py-2 text-[13.5px] font-medium text-white">
        <Upload size={15} aria-hidden="true" /> Upload manual
      </button>
    );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => { setOpen(false); reset(); }}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card w-[26rem] max-w-full p-6">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">Upload manual</h2>
        <p className="mt-1 text-[13px] text-[#6e6e73]">Pick a PDF — it starts reading on its own.</p>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-5 text-left hover:bg-black/[0.04]"
        >
          <FileUp size={20} aria-hidden="true" className="shrink-0 text-[#6e6e73]" />
          <span>
            <span className="block text-[13.5px] font-medium">
              {file ? file.name : "Choose a PDF file"}
            </span>
            <span className="block text-[12.5px] tabular text-[#6e6e73]">
              {file ? `${(file.size / 1048576).toFixed(1)} MB` : "Up to 100MB"}
            </span>
          </span>
        </button>
        <input
          ref={fileRef} type="file" accept=".pdf,application/pdf" required
          className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />

        <label className="mt-3 block">
          <span className="text-[12.5px] font-medium text-[#515154]">Name (optional)</span>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setTouchedTitle(true); }}
            placeholder="Taken from the file name"
            className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none placeholder:text-[#6e6e73] focus:border-[#0071e3]"
          />
        </label>

        {err && <p className="mt-3 text-[13px] text-[#d70015]">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => { setOpen(false); reset(); }} className="px-3 py-2 text-sm text-[#515154]">Cancel</button>
          <button disabled={busy || !file} className="rounded-full bg-[#1d1d1f] px-5 py-2 text-sm font-medium text-white disabled:opacity-40">
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>
    </div>
  );
}

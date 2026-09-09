"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { api } from "@/lib/api";

export function ManualUploadModal({ onDone }: { onDone: (upload: { document_id: string; job_id: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const fd = new FormData(e.currentTarget);
      const upload = await api.upload(fd);
      setOpen(false);
      onDone(upload);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed (PDF ≤ 100MB, admin only).");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form onSubmit={submit} className="card w-96 space-y-3 p-6">
        <h2 className="font-display text-[16px] font-semibold tracking-tight">Upload manual</h2>
        <input name="title" required placeholder="Title" className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none placeholder:text-[#6e6e73] focus:border-[#0071e3]" />
        <div className="flex gap-2">
          <input name="family_key" required placeholder="family_key" className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none placeholder:text-[#6e6e73] focus:border-[#0071e3]" />
          <input name="revision" placeholder="revision" className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none placeholder:text-[#6e6e73] focus:border-[#0071e3]" />
        </div>
        <input name="file" type="file" accept=".pdf" required className="text-sm" />
        {err && <p className="text-sm text-[#d70015]">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-[#515154]">Cancel</button>
          <button disabled={busy} className="rounded-full bg-[#1d1d1f] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>
    </div>
  );
}

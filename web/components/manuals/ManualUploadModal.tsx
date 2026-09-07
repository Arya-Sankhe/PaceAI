"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { api } from "@/lib/api";

export function ManualUploadModal({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const fd = new FormData(e.currentTarget);
      await api.upload(fd);
      setOpen(false);
      onDone();
    } catch {
      setErr("Upload failed (PDF ≤ 100MB, admin only).");
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded bg-emerald-600 px-3 py-2 text-sm font-medium">
        <Upload size={16} /> Upload manual
      </button>
    );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form onSubmit={submit} className="w-96 space-y-3 rounded-lg border border-zinc-700 bg-zinc-900 p-5">
        <h2 className="font-semibold">Upload manual (admin)</h2>
        <input name="title" required placeholder="Title" className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm" />
        <div className="flex gap-2">
          <input name="family_key" required placeholder="family_key" className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm" />
          <input name="revision" placeholder="revision" className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm" />
        </div>
        <input name="file" type="file" accept=".pdf" required className="text-sm" />
        {err && <p className="text-sm text-red-300">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="px-3 py-1 text-sm text-zinc-400">Cancel</button>
          <button disabled={busy} className="rounded bg-emerald-600 px-3 py-1 text-sm disabled:opacity-50">
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>
    </div>
  );
}

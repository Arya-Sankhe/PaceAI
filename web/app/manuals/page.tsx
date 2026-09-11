"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, FileText, Trash2 } from "lucide-react";
import { api, type Manual } from "@/lib/api";
import { ManualUploadModal } from "@/components/manuals/ManualUploadModal";

export default function ManualsPage() {
  const [docs, setDocs] = useState<Manual[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [jobErrors, setJobErrors] = useState<Record<string, string>>({});
  const load = () => {
    setLoading(true);
    return api.manuals().then(setDocs).catch((e) => setError(e instanceof Error ? e.message : "manuals_unavailable")).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!docs.some((d) => d.status === "pending" || d.status === "processing")) return;
    const t = setInterval(() => { api.manuals().then(setDocs).catch(() => {}); }, 4000);
    return () => clearInterval(t);
  }, [docs]);

  useEffect(() => {
    docs.filter((d) => d.status === "failed" && !jobErrors[d.id]).forEach(async (d) => {
      try {
        const j = await api.job(d.id);
        if (j.last_error) setJobErrors((p) => ({ ...p, [d.id]: j.last_error as string }));
      } catch { /* job row itself missing — status pill is enough */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);

  async function uploaded(upload: { document_id: string; job_id: string; deduped?: boolean }) {
    if (upload.deduped) {
      setNotice("That's already in your library — no need to upload it twice.");
      await load();
      return;
    }
    setNotice("Upload received — reading it now. This page updates on its own.");
    await load();
    for (let i = 0; i < 30; i += 1) {
      const job = await api.job(upload.document_id);
      if (job.status === "completed") { setNotice("Manual ready — the assistant can cite it now."); await load(); return; }
      if (job.status === "failed") { setError(job.last_error || "Couldn't read that file. Try deleting it and uploading again."); await load(); return; }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    setError("Still reading — give it a minute, then refresh.");
  }

  async function useVersion(id: string) {
    setError(""); setNotice("");
    try { await api.activate(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "activate_failed"); }
  }

  async function removeDoc(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? The assistant will no longer cite it.`)) return;
    setError(""); setNotice("");
    try { await api.removeDoc(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "delete_failed"); }
  }

  return (
    <div className="enter mx-auto w-full max-w-[760px] space-y-5 pb-16 pt-4 sm:pt-8">
      <header className="mx-auto max-w-[560px] text-center">
        <h1 className="font-display text-[30px] font-semibold tracking-tight text-white sm:text-[38px]">Manuals</h1>
        <p className="mt-1.5 text-[13.5px] text-white/55">The knowledge the assistant cites in its answers.</p>
        <div className="mt-4 flex justify-center"><ManualUploadModal onDone={uploaded} /></div>
      </header>
      {notice && <p className="mx-auto max-w-[560px] rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-3.5 text-center text-sm text-emerald-100">{notice}</p>}
      {error && <p className="mx-auto max-w-[560px] rounded-2xl border border-red-400/25 bg-red-400/10 p-3.5 text-center text-sm text-red-100">{error}</p>}
      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
              <th className="px-5 py-3">Title</th>
              <th className="hidden px-3 py-3 sm:table-cell">Pages</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {docs.map((d) => (
              <tr key={d.id} className="transition-colors hover:bg-white/[0.03]">
                <td className="px-5 py-3">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-white/70">
                      <FileText size={14} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      {d.status === "ready" && d.total_pages > 0 ? (
                        <Link href={`/manuals/${d.id}/1`} className="flex items-center gap-1 font-semibold text-white hover:underline">
                          <span className="truncate">{d.title}</span> <ArrowUpRight size={13} className="shrink-0 text-white/40" />
                        </Link>
                      ) : (
                        <span className="block truncate font-semibold text-white">{d.title}</span>
                      )}
                      <span className="block text-[12px] text-white/40">{d.revision}</span>
                    </span>
                  </span>
                </td>
                <td className="hidden px-3 py-3 tabular text-white/55 sm:table-cell">
                  {d.total_pages > 0 ? d.total_pages : d.status === "failed" ? "—" : "…"}
                </td>
                <td className="px-3 py-3">
                  <StatusPill doc={d} />
                  {d.status === "failed" && jobErrors[d.id] && (
                    <div className="mt-1 max-w-[16rem] text-[12px] text-[#ff8a8a]">{jobErrors[d.id]}</div>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {d.status === "ready" && !d.is_active && (
                      <button onClick={() => useVersion(d.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.07] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-all hover:bg-white hover:text-black">
                        <Check size={13} aria-hidden="true" /> Use this version
                      </button>
                    )}
                    <button onClick={() => removeDoc(d.id, d.title)} aria-label={`Delete ${d.title}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-red-400/15 hover:text-red-200">
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && <p className="text-center text-sm text-white/45">Loading manuals…</p>}
      {!loading && docs.length === 0 && <p className="mx-auto max-w-[420px] text-center text-sm leading-relaxed text-white/50">Nothing here yet. Upload a PDF and the assistant will start citing it once reading finishes.</p>}
    </div>
  );
}

function StatusPill({ doc }: { doc: Manual }) {
  if (doc.status === "failed")
    return <span className="rounded-full border border-red-400/25 bg-red-400/10 px-2.5 py-1 text-[12px] font-semibold text-red-100">Couldn&apos;t read it</span>;
  if (doc.status !== "ready")
    return <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[12px] font-semibold text-amber-100">Reading…</span>;
  if (doc.is_active)
    return <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[12px] font-semibold text-emerald-100">In use</span>;
  return <span className="rounded-full border border-white/12 bg-white/[0.07] px-2.5 py-1 text-[12px] font-semibold text-white/65">Ready</span>;
}

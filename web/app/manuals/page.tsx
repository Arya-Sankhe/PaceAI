"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Trash2 } from "lucide-react";
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

  // Keep the list fresh while the reader works through an upload.
  useEffect(() => {
    if (!docs.some((d) => d.status === "pending" || d.status === "processing")) return;
    const t = setInterval(() => { api.manuals().then(setDocs).catch(() => {}); }, 4000);
    return () => clearInterval(t);
  }, [docs]);

  // Surface why a failed upload failed.
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
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-tight">Manuals</h1>
          <p className="mt-1 text-[13.5px] text-[#6e6e73]">The knowledge the assistant cites in its answers.</p>
        </div>
        <div className="ml-auto"><ManualUploadModal onDone={uploaded} /></div>
      </header>
      {notice && <p className="rounded-2xl bg-[#1d8127]/10 p-3.5 text-sm text-[#1d8127]">{notice}</p>}
      {error && <p className="rounded-2xl bg-[#d70015]/[0.06] p-3.5 text-sm text-[#d70015]">{error}</p>}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[12px] font-medium uppercase tracking-[0.06em] text-[#6e6e73]">
              <th className="px-5 py-3">Title</th>
              <th className="hidden px-3 py-3 sm:table-cell">Pages</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.05]">
            {docs.map((d) => (
              <tr key={d.id}>
                <td className="px-5 py-3">
                  {d.status === "ready" && d.total_pages > 0 ? (
                    <Link href={`/manuals/${d.id}/1`} className="font-medium text-[#0071e3]">{d.title}</Link>
                  ) : (
                    <span className="font-medium">{d.title}</span>
                  )}
                  <span className="ml-2 text-[12px] text-[#6e6e73]">{d.revision}</span>
                </td>
                <td className="hidden px-3 py-3 tabular text-[#515154] sm:table-cell">
                  {d.total_pages > 0 ? d.total_pages : d.status === "failed" ? "—" : "…"}
                </td>
                <td className="px-3 py-3">
                  <StatusPill doc={d} />
                  {d.status === "failed" && jobErrors[d.id] && (
                    <div className="mt-1 max-w-[16rem] text-[12px] text-[#d70015]">{jobErrors[d.id]}</div>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {d.status === "ready" && !d.is_active && (
                      <button onClick={() => useVersion(d.id)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-[12.5px] font-medium hover:bg-black/[0.07]">
                        <Check size={13} aria-hidden="true" /> Use this version
                      </button>
                    )}
                    <button onClick={() => removeDoc(d.id, d.title)} aria-label={`Delete ${d.title}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6e6e73] hover:bg-[#d70015]/[0.07] hover:text-[#d70015]">
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && <p className="text-sm text-[#6e6e73]">Loading manuals…</p>}
      {!loading && docs.length === 0 && <p className="text-sm text-[#6e6e73]">Nothing here yet. Upload a PDF and the assistant will start citing it once reading finishes.</p>}
    </div>
  );
}

function StatusPill({ doc }: { doc: Manual }) {
  if (doc.status === "failed")
    return <span className="rounded-full bg-[#d70015]/[0.07] px-2.5 py-1 text-[12px] font-medium text-[#d70015]">Couldn&apos;t read it</span>;
  if (doc.status !== "ready")
    return <span className="rounded-full bg-[#b45309]/10 px-2.5 py-1 text-[12px] font-medium text-[#b45309]">Reading…</span>;
  if (doc.is_active)
    return <span className="rounded-full bg-[#1d8127]/10 px-2.5 py-1 text-[12px] font-medium text-[#1d8127]">In use</span>;
  return <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[12px] font-medium text-[#515154]">Ready</span>;
}

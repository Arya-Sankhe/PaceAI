"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Manual } from "@/lib/api";
import { ManualUploadModal } from "@/components/manuals/ManualUploadModal";

export default function ManualsPage() {
  const [docs, setDocs] = useState<Manual[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    return api.manuals().then(setDocs).catch((e) => setError(e instanceof Error ? e.message : "manuals_unavailable")).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  async function uploaded(upload: { document_id: string; job_id: string }) {
    setNotice("Upload received. Waiting for ingestion…");
    for (let i = 0; i < 30; i += 1) {
      const job = await api.job(upload.document_id);
      if (job.status === "completed") { setNotice("Manual ready."); await load(); return; }
      if (job.status === "failed") { setError(job.last_error || "manual_ingestion_failed"); return; }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    setError("Manual is still processing. Refresh shortly.");
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
              <th className="px-3 py-3">Revision</th>
              <th className="px-3 py-3">Pages</th>
              <th className="px-5 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.05]">
            {docs.map((d) => (
              <tr key={d.id}>
                <td className="px-5 py-3">
                  <Link href={`/manuals/${d.id}/1`} className="font-medium text-[#0071e3]">{d.title}</Link>
                </td>
                <td className="px-3 py-3 text-[#515154]">{d.revision}</td>
                <td className="px-3 py-3 tabular text-[#515154]">{d.total_pages}</td>
                <td className="px-5 py-3 text-right text-[#515154]">{d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && <p className="text-sm text-[#6e6e73]">Loading manuals…</p>}
      {!loading && docs.length === 0 && <p className="text-sm text-[#6e6e73]">No manuals yet. Upload one to ground the assistant.</p>}
    </div>
  );
}

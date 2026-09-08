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
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Manual library</h1>
        <ManualUploadModal onDone={uploaded} />
      </header>
      {notice && <p className="rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-200">{notice}</p>}
      {error && <p className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-200">{error}</p>}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-zinc-500">
          <th className="py-1">Title</th><th>Revision</th><th>Pages</th><th>Status</th>
        </tr></thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-t border-zinc-800">
              <td className="py-2">
                <Link href={`/manuals/${d.id}/1`} className="text-sky-300">{d.title}</Link>
              </td>
              <td className="text-zinc-400">{d.revision}</td>
              <td className="text-zinc-400">{d.total_pages}</td>
              <td>{d.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <p className="text-sm text-zinc-500">Loading manuals…</p>}
      {!loading && docs.length === 0 && <p className="text-sm text-zinc-500">No ready manuals yet.</p>}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Manual } from "@/lib/api";
import { ManualUploadModal } from "@/components/manuals/ManualUploadModal";

export default function ManualsPage() {
  const [docs, setDocs] = useState<Manual[]>([]);
  const load = () => api.manuals().then(setDocs).catch(() => {});
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Manual library</h1>
        <ManualUploadModal onDone={load} />
      </header>
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
      {docs.length === 0 && <p className="text-sm text-zinc-500">No ready manuals yet.</p>}
    </div>
  );
}

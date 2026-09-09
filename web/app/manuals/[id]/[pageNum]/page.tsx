"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

// ponytail: plain <img> on a 300s signed URL, refetched at 240s — no PDF.js for page PNGs.
export default function PageViewer() {
  const { id, pageNum } = useParams<{ id: string; pageNum: string }>();
  const num = Number(pageNum);
  const [url, setUrl] = useState("");
  const [zoom, setZoom] = useState(1);

  const load = useCallback(
    () => api.pageUrl(id, num).then((r) => setUrl(r.url)).catch(() => {}),
    [id, num]
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 240_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/manuals" className="text-[13px] font-medium text-[#0071e3]">← Library</Link>
        <h1 className="font-display text-[20px] font-semibold tracking-tight">Page {num}</h1>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="rounded-full bg-black/[0.04] px-3 py-1 text-sm">−</button>
          <button onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} className="rounded-full bg-black/[0.04] px-3 py-1 text-sm">+</button>
        </div>
        {num > 1 && <Link href={`/manuals/${id}/${num - 1}`} className="text-[13px] font-medium text-[#0071e3]">← Prev</Link>}
        <Link href={`/manuals/${id}/${num + 1}`} className="text-[13px] font-medium text-[#0071e3]">Next →</Link>
      </header>
      {url ? (
        <img src={url} alt={`Manual page ${num}`} style={{ width: `${zoom * 100}%` }}
          className="card mx-auto" />
      ) : (
        <p className="text-sm text-[#6e6e73]">Loading page…</p>
      )}
    </div>
  );
}

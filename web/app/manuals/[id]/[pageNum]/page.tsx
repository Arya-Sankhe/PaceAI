"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

// ponytail: plain <img> on a 300s signed URL, refetched at 240s — no PDF.js for page PNGs.
export default function PageViewer({ params }: { params: { id: string; pageNum: string } }) {
  const num = Number(params.pageNum);
  const [url, setUrl] = useState("");
  const [zoom, setZoom] = useState(1);

  const load = useCallback(
    () => api.pageUrl(params.id, num).then((r) => setUrl(r.url)).catch(() => {}),
    [params.id, num]
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 240_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-3">
        <Link href="/manuals" className="text-sm text-sky-300">← Library</Link>
        <h1 className="font-bold">Page {num}</h1>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="rounded bg-zinc-800 px-2">−</button>
          <button onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} className="rounded bg-zinc-800 px-2">+</button>
        </div>
        {num > 1 && <Link href={`/manuals/${params.id}/${num - 1}`} className="text-sm text-sky-300">← Prev</Link>}
        <Link href={`/manuals/${params.id}/${num + 1}`} className="text-sm text-sky-300">Next →</Link>
      </header>
      {url ? (
        <img src={url} alt={`Manual page ${num}`} style={{ width: `${zoom * 100}%` }}
          className="mx-auto rounded border border-zinc-800" />
      ) : (
        <p className="text-sm text-zinc-500">Loading page…</p>
      )}
    </div>
  );
}

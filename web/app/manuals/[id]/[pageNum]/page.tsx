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
    <div className="enter mx-auto w-full max-w-[760px] space-y-4 pb-16 pt-4 sm:pt-8">
      <header className="flex flex-wrap items-center gap-3 px-1">
        <Link href="/manuals" className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[13px] font-semibold text-white/70 backdrop-blur transition-colors hover:text-white">← Library</Link>
        <h1 className="font-display text-[20px] font-semibold tracking-tight text-white">Page {num}</h1>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out" className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-white backdrop-blur transition-colors hover:text-white">−</button>
          <button onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in" className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-white backdrop-blur transition-colors hover:text-white">+</button>
        </div>
        {num > 1 && <Link href={`/manuals/${id}/${num - 1}`} className="text-[13px] font-semibold text-white/70 hover:text-white">← Prev</Link>}
        <Link href={`/manuals/${id}/${num + 1}`} className="text-[13px] font-semibold text-white/70 hover:text-white">Next →</Link>
      </header>
      {url ? (
        <img src={url} alt={`Manual page ${num}`} style={{ width: `${zoom * 100}%` }}
          className="glass mx-auto !rounded-2xl" />
      ) : (
        <p className="py-16 text-center text-sm text-white/50">Loading page…</p>
      )}
    </div>
  );
}

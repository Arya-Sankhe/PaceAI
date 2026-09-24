"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { api } from "@/lib/api";

// A cited page, read without leaving the chat. Rendered through a portal so the
// chat's own scroll container cannot clip it.
export function PagePreview({ documentId, page, revision, onClose }: {
  documentId: string;
  page: number;
  revision: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.pageUrl(documentId, page)
      .then((r) => {
        if (alive) setUrl(r.url);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [documentId, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="black-card flex max-h-full w-full max-w-[900px] flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative z-10 flex items-center gap-3 border-b border-white/10 px-5 py-3">
          <h2 className="font-display text-[15px] font-semibold tracking-tight text-white">Page {page}</h2>
          <span className="text-[12.5px] tabular text-white/45">rev {revision}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
              aria-label="Zoom out"
              className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-sm text-white/80 transition-colors hover:text-white"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
              aria-label="Zoom in"
              className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-sm text-white/80 transition-colors hover:text-white"
            >
              +
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="relative z-10 min-h-0 flex-1 overflow-auto bg-black/20 p-4">
          {url ? (
            // ponytail: plain <img> on a 300s signed URL — the page is already a PNG.
            <img
              src={url}
              alt={`Manual page ${page}`}
              style={{ width: `${zoom * 100}%` }}
              className="mx-auto !rounded-xl"
            />
          ) : failed ? (
            <p className="py-16 text-center text-sm text-white/50">Could not load that page.</p>
          ) : (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-white/50">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" />
              Loading page…
            </p>
          )}
        </div>

        <footer className="relative z-10 flex items-center justify-end border-t border-white/10 px-5 py-3">
          <Link
            href={`/manuals/${documentId}/${page}`}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-white/60 transition-colors hover:text-white"
          >
            Open full page <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

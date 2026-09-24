"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import type { Citation } from "@/hooks/useCopilotStream";
import { PagePreview } from "./PagePreview";

// Opens the cited page over the chat instead of navigating away from it.
export function CitationPill({ c }: { c: Citation }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Preview page ${c.page_number} of revision ${c.revision}`}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[12px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white"
      >
        <BookOpen size={12} aria-hidden="true" /> p.{c.page_number} · {c.revision}
      </button>
      {open && (
        <PagePreview
          documentId={c.document_id}
          page={c.page_number}
          revision={c.revision}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

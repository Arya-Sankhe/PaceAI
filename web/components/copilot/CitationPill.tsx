import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { Citation } from "@/hooks/useCopilotStream";

export function CitationPill({ c }: { c: Citation }) {
  return (
    <Link href={`/manuals/${c.document_id}/${c.page_number}`}
      className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-200">
      <BookOpen size={12} /> p.{c.page_number} · {c.revision}
    </Link>
  );
}

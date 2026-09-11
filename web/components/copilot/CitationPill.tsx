import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { Citation } from "@/hooks/useCopilotStream";

export function CitationPill({ c }: { c: Citation }) {
  return (
    <Link href={`/manuals/${c.document_id}/${c.page_number}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[12px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white">
      <BookOpen size={12} aria-hidden="true" /> p.{c.page_number} · {c.revision}
    </Link>
  );
}

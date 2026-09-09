import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { Citation } from "@/hooks/useCopilotStream";

export function CitationPill({ c }: { c: Citation }) {
  return (
    <Link href={`/manuals/${c.document_id}/${c.page_number}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-[12px] font-medium text-[#515154] hover:bg-black/[0.06]">
      <BookOpen size={12} aria-hidden="true" /> p.{c.page_number} · {c.revision}
    </Link>
  );
}

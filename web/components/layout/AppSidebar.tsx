"use client";

import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  BookOpen,
  Cpu,
  Flame,
  Gauge,
  History,
  LayoutDashboard,
  LifeBuoy,
  Settings2,
  Sparkles,
} from "lucide-react";
import { MACHINES } from "@/components/cockpit/meta";

export type ViewId =
  | "overview"
  | "heaters"
  | "drives"
  | "production"
  | "system"
  | "history"
  | "assistant";

export const VIEWS: { id: ViewId; label: string; icon: typeof Gauge }[] = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "heaters", label: "Heaters", icon: Flame },
  { id: "drives", label: "Drives", icon: Settings2 },
  { id: "production", label: "Production", icon: Activity },
  { id: "system", label: "System", icon: Cpu },
  { id: "history", label: "History", icon: History },
  { id: "assistant", label: "Assistant", icon: Sparkles },
];

export function AppSidebar() {
  const pathname = usePathname();
  const params = useParams<{ key?: string }>();
  const search = useSearchParams();
  const machineKey = params?.key ?? (pathname.startsWith("/machines/") ? pathname.split("/")[2] : undefined);
  const tab = (search.get("tab") as ViewId) || (pathname.endsWith("/history") ? "history" : "overview");
  const onMachine = !!machineKey;

  return (
    <div className="flex h-full flex-col gap-1 px-3 py-5">
      <Link href="/" className="mb-4 flex items-center gap-2.5 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1d1d1f] text-[15px] font-semibold text-white">
          P
        </span>
        <span className="leading-tight">
          <span className="font-display block text-[15px] font-semibold tracking-tight">PaceAI</span>
          <span className="block text-[11px] text-[#6e6e73]">Orion line</span>
        </span>
      </Link>

      <nav aria-label="Primary" className="contents">
      <SideLink href="/" icon={LayoutDashboard} label="Fleet" active={pathname === "/"} />

      <div className="mb-1 mt-4 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#6e6e73]">
        Machines
      </div>
      {MACHINES.map((m) => {
        const active = machineKey === m.key && (pathname === `/machines/${m.key}` || pathname.startsWith(`/machines/${m.key}/`));
        return (
          <Link
            key={m.key}
            href={`/machines/${m.key}?tab=overview`}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] ${
              active ? "bg-black/[0.05] font-medium text-[#1d1d1f]" : "text-[#515154] hover:bg-black/[0.03]"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${m.key === "orion_1" ? "bg-[#1d8127]" : "bg-[#6e6e73]"}`} />
            {m.name}
          </Link>
        );
      })}

      {onMachine && machineKey && (
        <>
          <div className="mb-1 mt-4 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#6e6e73]">
            {MACHINES.find((m) => m.key === machineKey)?.short ?? "Machine"}
          </div>
          <nav aria-label="Machine sections" className="contents">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const active = pathname.startsWith(`/machines/${machineKey}`) && tab === v.id;
            return (
              <Link
                key={v.id}
                href={`/machines/${machineKey}?tab=${v.id}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] ${
                  active ? "bg-black/[0.05] font-medium text-[#1d1d1f]" : "text-[#515154] hover:bg-black/[0.03]"
                }`}
              >
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" className={active ? "text-[#1d1d1f]" : "text-[#6e6e73]"} />
                {v.label}
              </Link>
            );
          })}
          </nav>
        </>
      )}

      <div className="mt-auto space-y-1 pt-4">
        <SideLink href="/manuals" icon={BookOpen} label="Manuals" active={pathname.startsWith("/manuals")} />
        <div className="mx-2 mt-3 flex items-start gap-2 rounded-2xl bg-black/[0.03] p-3 text-[12px] leading-snug text-[#515154]">
          <LifeBuoy size={14} className="mt-0.5 shrink-0 text-[#6e6e73]" aria-hidden="true" />
          <span>Read-only diagnostics. Nothing here can command the machine.</span>
        </div>
      </div>
      </nav>
    </div>
  );
}

function SideLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: typeof Gauge;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] ${
        active ? "bg-black/[0.05] font-medium text-[#1d1d1f]" : "text-[#515154] hover:bg-black/[0.03]"
      }`}
    >
      <Icon size={16} strokeWidth={1.8} aria-hidden="true" className={active ? "text-[#1d1d1f]" : "text-[#6e6e73]"} />
      {label}
    </Link>
  );
}

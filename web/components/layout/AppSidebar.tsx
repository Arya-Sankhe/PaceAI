"use client";

import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Cpu,
  Flame,
  Gauge,
  History,
  LayoutDashboard,
  PanelLeftClose,
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

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const params = useParams<{ key?: string }>();
  const search = useSearchParams();
  const machineKey =
    params?.key ?? (pathname.startsWith("/machines/") ? pathname.split("/")[2] : undefined);
  const tab = (search.get("tab") as ViewId) || (pathname.endsWith("/history") ? "history" : "overview");
  const onMachine = !!machineKey;
  const activeMachine = MACHINES.find((m) => m.key === machineKey);

  return (
    <div className="side-shell flex h-full flex-col px-3.5 py-4">
      {/* brand — fixed height forever. The P toggles in both states and rides
          the icon column; the chevron pins right while open. */}
      <div className="nogap brand-row mb-5 flex h-14 shrink-0 items-center gap-2">
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="nogap brand-toggle flex min-w-0 items-center gap-2.5 rounded-xl transition-colors hover:bg-white/[0.06]"
        >
          <span className="brand-p flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white text-[17px] font-bold tracking-tighter text-black shadow-[0_0_24px_rgba(255,255,255,0.25)]">
            P
          </span>
          <span className="side-extra text-left leading-tight">
            <span className="block text-[16px] font-semibold tracking-tight text-white">paceai</span>
            <span className="block text-[11px] font-medium text-white/40">Orion line</span>
          </span>
        </button>
        <button
          onClick={onToggle}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          tabIndex={collapsed ? -1 : 0}
          className="collapse-btn ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/40 hover:bg-white/[0.07] hover:text-white"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-[3px]">
        <SideLink
          href="/"
          label="Fleet"
          icon={LayoutDashboard}
          active={pathname === "/"}
          collapsed={collapsed}
        />

        <div className="side-section mb-1 mt-5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
          Machines
        </div>
        {MACHINES.map((m, i) => {
          const active =
            machineKey === m.key &&
            (pathname === `/machines/${m.key}` || pathname.startsWith(`/machines/${m.key}/`));
          return (
            <Link
              key={m.key}
              href={`/machines/${m.key}?tab=overview`}
              aria-current={active ? "page" : undefined}
              title={collapsed ? m.name : undefined}
              data-active={active}
              className="side-item"
            >
              <span className="side-icon" style={{ background: active ? "#fff" : undefined }}>
                <span
                  className={`machine-dot h-2 w-2 rounded-full ${
                    m.key === "orion_1" ? "bg-emerald-400" : "bg-zinc-400"
                  } ${m.key === "orion_1" && !active ? "live-dot" : ""}`}
                  style={active && m.key === "orion_1" ? { background: "#059669" } : undefined}
                />
                <span className="machine-num font-display hidden text-[13px] font-bold tabular" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </span>
              <span className="side-label">{m.name}</span>
            </Link>
          );
        })}

        {onMachine && machineKey && (
          <>
            <div className="side-section mb-1 mt-5 flex items-center gap-2 px-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
              <span className="truncate">{activeMachine?.short ?? "Machine"}</span>
              <span className="side-extra ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/15 text-[9px] font-bold text-emerald-300">
                •
              </span>
            </div>
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = pathname.startsWith(`/machines/${machineKey}`) && tab === v.id;
              return (
                <Link
                  key={v.id}
                  href={`/machines/${machineKey}?tab=${v.id}`}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? v.label : undefined}
                  data-active={active}
                  className="side-item"
                >
                  <span className="side-icon">
                    <Icon size={15} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="side-label flex items-center gap-1.5">
                    {v.label}
                    {v.id === "assistant" && (
                      <span className="side-extra rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-white/60">
                        AI
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* bottom */}
      <div className="mt-auto flex flex-col gap-[3px] pt-4">
        <Link
          href="/manuals"
          aria-current={pathname.startsWith("/manuals") ? "page" : undefined}
          data-active={pathname.startsWith("/manuals")}
          title={collapsed ? "Docs" : undefined}
          className="side-item"
        >
          <span className="side-icon">
            <BookOpen size={15} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="side-label">Docs</span>
          <ArrowUpRight size={13} aria-hidden="true" className="side-extra ml-auto text-white/30" />
        </Link>
      </div>
    </div>
  );
}

function SideLink({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: typeof Gauge;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      data-active={active}
      className="side-item"
    >
      <span className="side-icon">
        <Icon size={15} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="side-label">{label}</span>
    </Link>
  );
}

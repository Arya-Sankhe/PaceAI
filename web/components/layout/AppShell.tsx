"use client";

import { Suspense, useEffect, useState } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("paceai-sidebar") === "collapsed");
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem("paceai-sidebar", c ? "expanded" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <div className="app-shell">
      {/* ------- Black sidebar rail ------- */}
      <aside
        aria-label="Primary navigation"
        style={{
          width: collapsed ? 68 : 268,
          transition: "width 620ms var(--ease-collapse)",
        }}
        className={`hidden shrink-0 flex-col overflow-hidden bg-[#060607] transition-opacity duration-500 lg:flex ${
          collapsed ? "sidebar-collapsed" : ""
        } ${ready ? "opacity-100" : "opacity-0"}`}
      >
        <Suspense>
          <AppSidebar collapsed={collapsed} onToggle={toggle} />
        </Suspense>
      </aside>

      {/* ------- Sage dashboard panel ------- */}
      <div className="wafer-main-wrap">
        <main id="main" className="wafer-main">
          <div className="wafer-clouds" aria-hidden="true" />
          <div className="wafer-scroll">
            {/* mobile nav */}
            <header className="sticky top-0 z-10 mx-3 mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2.5 backdrop-blur-xl lg:hidden">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[13px] font-bold text-black">
                P
              </span>
              <span className="text-[14px] font-semibold tracking-tight text-white">PaceAI</span>
              <nav className="ml-auto flex items-center gap-3 text-[12.5px] font-medium text-white/65">
                <a href="/" className="transition-colors hover:text-white">Fleet</a>
                <a href="/machines/orion_1?tab=overview" className="transition-colors hover:text-white">#1</a>
                <a href="/manuals" className="transition-colors hover:text-white">Manuals</a>
              </nav>
            </header>

            <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pb-10 pt-2 sm:px-6 lg:px-10">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { AppSidebar } from "@/components/layout/AppSidebar";

export const metadata: Metadata = { title: "PaceAI Orion" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-black/[0.06] bg-[#fafaf9]/85 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1d1d1f] text-sm font-semibold text-white">
              P
            </span>
            <span className="font-display text-[15px] font-semibold tracking-tight">PaceAI</span>
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-[13px] text-[#515154]">
            <Link href="/">Fleet</Link>
            <Link href="/machines/orion_1?tab=overview">Orion #1</Link>
            <Link href="/manuals">Manuals</Link>
          </nav>
        </header>

        <div className="mx-auto flex min-h-[100dvh] max-w-[1440px]">
          <aside className="sticky top-0 hidden h-[100dvh] w-[248px] shrink-0 border-r border-black/[0.06] lg:block">
            <Suspense>
              <AppSidebar />
            </Suspense>
          </aside>
          <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            <div className="mx-auto w-full max-w-[1064px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}

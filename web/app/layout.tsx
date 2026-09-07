import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "PaceAI Orion Copilot" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="flex items-center gap-4 border-b border-zinc-800 px-4 py-2 text-sm">
          <Link href="/" className="font-bold text-emerald-300">PaceAI</Link>
          <Link href="/manuals" className="text-zinc-300">Manuals</Link>
        </nav>
        <main className="mx-auto max-w-6xl p-4">{children}</main>
      </body>
    </html>
  );
}

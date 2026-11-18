import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ANS Screener – Supertrend Saham BEI",
  description: "Screener saham Indonesia berbasis Supertrend (ATR 10, multiplier 1.5).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              ANS <span className="text-emerald-600">Screener</span>
            </Link>
            <nav className="flex gap-1 text-sm text-slate-600">
              <Link href="/" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">Screener</Link>
              <Link href="/admin/upload" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">Upload data</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs text-slate-500">
          Alat bantu analisis teknikal, bukan rekomendasi investasi.
        </footer>
      </body>
    </html>
  );
}

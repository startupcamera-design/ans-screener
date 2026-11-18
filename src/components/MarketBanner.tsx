"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { INDEX_TICKER, ST_MULT, ST_PERIOD } from "@/lib/config";
import { supertrend } from "@/lib/supertrend";
import type { VBar } from "@/lib/metrics";

const GREEN = "#059669";
const RED = "#e11d48";
const num = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const pct = (v: number, sign = false) => `${sign && v > 0 ? "+" : ""}${num.format(v)}%`;
const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

type Props = {
  /** jumlah saham bullish dan total saham aktif (untuk "breadth" pasar) */
  bull: number;
  total: number;
};

export default function MarketBanner({ bull, total }: Props) {
  const [bars, setBars] = useState<VBar[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabaseBrowser()
          .from("prices")
          .select("date,open,high,low,close,volume")
          .eq("ticker", INDEX_TICKER)
          .order("date", { ascending: false })
          .limit(300);
        if (error) throw new Error(error.message);
        setBars(
          (data ?? []).reverse().map((d: any) => ({
            date: d.date, open: +d.open, high: +d.high, low: +d.low, close: +d.close, volume: +d.volume,
          }))
        );
      } catch (e: any) {
        setErr(e.message ?? String(e));
        setBars([]);
      }
    })();
  }, []);

  const calc = useMemo(() => {
    if (!bars || bars.length < ST_PERIOD) return null;
    const st = supertrend(bars, ST_PERIOD, ST_MULT);
    if (st.length === 0) return null;
    const last = st[st.length - 1];
    const bar = bars[bars.length - 1];
    const prev = bars.length > 1 ? bars[bars.length - 2].close : null;
    let days = 0;
    for (let i = st.length - 1; i >= 0 && st[i].trend === last.trend; i--) days++;
    const line = last.trend === 1 ? last.up : last.dn;
    return {
      st,
      bar,
      trend: last.trend,
      line,
      dist: ((bar.close - line) / bar.close) * 100,
      change: prev ? (bar.close / prev - 1) * 100 : null,
      days,
      signal: last.signal,
    };
  }, [bars]);

  if (bars === null) {
    return <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" role="status" aria-label="Memuat IHSG" />;
  }

  if (!calc) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
        <div className="font-semibold text-slate-800">IHSG belum bisa ditampilkan</div>
        <p className="mt-1">
          {err
            ? `Gagal memuat data IHSG: ${err}`
            : bars.length === 0
            ? <>Belum ada data <code className="rounded bg-slate-100 px-1">COMPOSITE</code>. Sertakan barisnya di file CSV Anda (kolom sama seperti saham), lalu unggah.</>
            : `Baru ada ${bars.length} bar IHSG; Supertrend butuh minimal ${ST_PERIOD} bar (idealnya 100+). Unggah riwayat yang lebih panjang.`}
        </p>
      </section>
    );
  }

  const bullish = calc.trend === 1;
  const breadth = total > 0 ? (bull / total) * 100 : null;

  return (
    <section
      aria-label="Kondisi pasar IHSG"
      className={`overflow-hidden rounded-2xl border bg-white ${bullish ? "border-emerald-200" : "border-rose-200"}`}
    >
      <div className={`h-1 ${bullish ? "bg-emerald-500" : "bg-rose-500"}`} />
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-x-6 gap-y-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">IHSG · Indeks Harga Saham Gabungan</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <span className="text-2xl font-bold tabular-nums md:text-3xl">{num.format(calc.bar.close)}</span>
              {calc.change !== null && (
                <span className={`text-base font-semibold tabular-nums ${calc.change >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {calc.change >= 0 ? "▲" : "▼"} {pct(Math.abs(calc.change))}
                  <span className="ml-1 text-[11px] font-normal text-slate-400">vs kemarin</span>
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">Penutupan {fmtDate(calc.bar.date)}</div>
          </div>

          <div className="md:text-right">
            <span
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold text-white md:px-4 md:py-2 md:text-sm ${bullish ? "bg-emerald-600" : "bg-rose-600"}`}
            >
              {bullish ? "▲ BULLISH" : "▼ BEARISH"}
            </span>
            {calc.signal && (
              <span className="ml-2 rounded bg-slate-900 px-2 py-1 text-xs font-bold text-white">{calc.signal} baru</span>
            )}
            <p className="mt-2 hidden max-w-xs text-xs leading-relaxed text-slate-600 md:ml-auto md:block">
              {bullish ? "Di atas" : "Di bawah"} garis Supertrend{" "}
              <span className="font-semibold tabular-nums">{num.format(calc.line)}</span> ({pct(calc.dist, true)}). Tren ini sudah berjalan{" "}
              {calc.days} hari bursa.
            </p>
          </div>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-600 md:hidden">
          {bullish ? "Di atas" : "Di bawah"} garis Supertrend <span className="font-semibold tabular-nums">{num.format(calc.line)}</span> ({pct(calc.dist, true)}), tren {calc.days} hari bursa.
        </p>

        <div className="mt-3 grid gap-3 md:mt-4 md:grid-cols-[1fr_280px] md:items-center md:gap-4">
          <Spark st={calc.st} bars={bars} />
          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-slate-600">Saham dengan tren bullish</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {breadth === null ? "–" : `${num.format(Math.round(breadth))}%`}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-rose-100">
              <div className="h-full bg-emerald-500" style={{ width: `${breadth ?? 0}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {num.format(bull)} dari {num.format(total)} saham aktif
              {breadth !== null && (
                <> · {breadth >= 60 ? "pasar luas menguat" : breadth >= 40 ? "pasar campuran" : "pasar luas melemah"}</>
              )}
            </div>
            <Link href={`/stock/${INDEX_TICKER}`} className="mt-3 inline-block text-xs font-medium text-emerald-700 hover:underline">
              Lihat grafik IHSG →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Grafik mini: penutupan 60 bar terakhir + garis Supertrend berwarna. */
function Spark({ st, bars }: { st: ReturnType<typeof supertrend>; bars: VBar[] }) {
  const N = Math.min(60, st.length);
  const pts = st.slice(-N);
  const closes = bars.slice(-N).map((b) => b.close);
  const lines = pts.map((p) => (p.trend === 1 ? p.up : p.dn));
  const all = [...closes, ...lines];
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const W = 300, H = 80, P = 4;
  const x = (i: number) => P + (i / Math.max(1, N - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);

  const segs: { d: string; c: string }[] = [];
  for (let i = 1; i < N; i++) {
    if (pts[i].trend !== pts[i - 1].trend) continue;
    segs.push({ d: `M${x(i - 1).toFixed(1)},${y(lines[i - 1]).toFixed(1)}L${x(i).toFixed(1)},${y(lines[i]).toFixed(1)}`, c: pts[i].trend === 1 ? GREEN : RED });
  }
  const close = closes.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join("");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-14 w-full md:h-20" role="img" aria-label="Grafik mini IHSG 60 hari dengan garis Supertrend">
      <path d={close} fill="none" stroke="#64748b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {segs.map((s, i) => (
        <path key={i} d={s.d} stroke={s.c} strokeWidth={2.5} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

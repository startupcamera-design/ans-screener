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
            date: d.date,
            open: +d.open,
            high: +d.high,
            low: +d.low,
            close: +d.close,
            volume: +d.volume,
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
    const prev5 = bars.length > 5 ? bars[bars.length - 6].close : null;
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
      change5d: prev5 ? (bar.close / prev5 - 1) * 100 : null,
      days,
      signal: last.signal,
    };
  }, [bars]);

  if (bars === null) {
    return <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white" role="status" aria-label="Memuat IHSG" />;
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
  const nearFlip = bullish && calc.dist < 1.2;
  const breadth = total > 0 ? (bull / total) * 100 : null;

  // Panduan porsi modal berdasarkan rezim IHSG, jarak ke garis SL indeks, & breadth pasar
  const regimeAdvice = !bullish
    ? "Rezim IHSG bearish — kurangi agresi (maks 2–3 slot) hanya pada Top Pick (≥ 86) dan patuhi SL otomatis."
    : nearFlip
    ? `IHSG bullish tapi tipis (${pct(calc.dist, true)} di atas garis) — waspada potensi flip bearish; batasi 3–4 slot.`
    : breadth === null || breadth >= 45
    ? "Rezim kondusif — siap alokasi penuh (4–5 slot) pada Top Pick (≥ 86)."
    : "IHSG bullish tapi selektif — fokus hanya pada Top Pick (≥ 86) ber-RS tinggi.";

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
                  <span className="ml-1 text-[11px] font-normal text-slate-400">1H</span>
                </span>
              )}
              {calc.change5d !== null && (
                <span className={`text-xs font-medium tabular-nums ${calc.change5d >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  ({pct(calc.change5d, true)} <span className="text-slate-400">5H</span>)
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
            <p className="mt-2 hidden max-w-lg text-xs leading-relaxed text-slate-600 md:ml-auto md:block">
              {bullish ? "Di atas" : "Di bawah"} garis Supertrend{" "}
              <span className="font-semibold tabular-nums">{num.format(calc.line)}</span> ({pct(calc.dist, true)}). Tren berjalan{" "}
              {calc.days} hari bursa.
            </p>
          </div>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-600 md:hidden">
          {bullish ? "Di atas" : "Di bawah"} garis Supertrend <span className="font-semibold tabular-nums">{num.format(calc.line)}</span> ({pct(calc.dist, true)}), tren {calc.days} hari bursa.
        </p>

        <div className="mt-3 grid gap-3 md:mt-4 md:grid-cols-[1fr_390px] md:items-center md:gap-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2">
            <CandleSpark st={calc.st} bars={bars} />
          </div>

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

            <div
              className={`mt-2.5 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug ${
                !bullish || nearFlip ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {regimeAdvice}
            </div>

            <Link href={`/stock/${INDEX_TICKER}`} className="mt-2.5 inline-block text-xs font-medium text-emerald-700 hover:underline">
              Lihat grafik lengkap IHSG →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Grafik mini candlestick: 65 bar terakhir + garis Supertrend memenuhi penuh lebar kotak. */
function CandleSpark({ st, bars }: { st: ReturnType<typeof supertrend>; bars: VBar[] }) {
  const N = Math.min(65, st.length, bars.length);
  const pts = st.slice(-N);
  const sliceBars = bars.slice(-N);
  const lines = pts.map((p) => (p.trend === 1 ? p.up : p.dn));

  const allValues = [
    ...sliceBars.map((b) => b.high),
    ...sliceBars.map((b) => b.low),
    ...lines,
  ];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;

  const W = 720;
  const H = 115;
  const P = 4;
  const step = (W - 2 * P) / Math.max(1, N);
  const candleW = Math.max(4, Math.min(8.5, step * 0.65));

  const cx = (i: number) => P + step * i + step / 2;
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);

  const stSegs: { d: string; c: string }[] = [];
  for (let i = 1; i < N; i++) {
    if (pts[i].trend !== pts[i - 1].trend) continue;
    stSegs.push({
      d: `M${cx(i - 1).toFixed(1)},${y(lines[i - 1]).toFixed(1)}L${cx(i).toFixed(1)},${y(lines[i]).toFixed(1)}`,
      c: pts[i].trend === 1 ? GREEN : RED,
    });
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-24 w-full md:h-28"
      role="img"
      aria-label="Grafik candlestick IHSG 65 hari terakhir dengan garis Supertrend"
    >
      {stSegs.map((s, i) => (
        <path key={`st-${i}`} d={s.d} stroke={s.c} strokeWidth={2} fill="none" strokeLinecap="round" />
      ))}

      {sliceBars.map((b, i) => {
        const xCenter = cx(i);
        const yHigh = y(b.high);
        const yLow = y(b.low);
        const yOpen = y(b.open);
        const yClose = y(b.close);
        const isUp = b.close >= b.open;
        const color = isUp ? GREEN : RED;
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1.8, Math.abs(yClose - yOpen));

        return (
          <g key={b.date}>
            <line
              x1={xCenter}
              y1={yHigh}
              x2={xCenter}
              y2={yLow}
              stroke={color}
              strokeWidth={1.2}
              opacity={0.85}
            />
            <rect
              x={xCenter - candleW / 2}
              y={bodyTop}
              width={candleW}
              height={bodyHeight}
              rx={0.8}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}
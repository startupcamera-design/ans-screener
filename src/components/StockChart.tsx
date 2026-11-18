"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ColorType, CrosshairMode, createChart } from "lightweight-charts";
import type { SeriesMarker, Time } from "lightweight-charts";
import { fetchAll, supabaseBrowser } from "@/lib/supabase-browser";
import { INDEX_TICKER, ST_MULT, ST_PERIOD } from "@/lib/config";
import { supertrend } from "@/lib/supertrend";
import { detectBullishPatterns } from "@/lib/candles";
import { toWeekly } from "@/lib/timeframe";
import { metricsFromDb, VBar } from "@/lib/metrics";
import { percentileMap, scoreMetrics } from "@/lib/scoring";
import ScoreBreakdown from "./ScoreBreakdown";

const GREEN = "#059669";
const RED = "#e11d48";
const fmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

type Legend = { time: string; o: number; h: number; l: number; c: number; v?: number };

export default function StockChart({ ticker }: { ticker: string }) {
  const [daily, setDaily] = useState<VBar[]>([]);
  const [row, setRow] = useState<any>(null);
  const [rs, setRs] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tf, setTf] = useState<"D" | "W">("D");
  const [showST, setShowST] = useState(true);
  const [showVol, setShowVol] = useState(true);
  const [showPat, setShowPat] = useState(true);
  const [legend, setLegend] = useState<Legend | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const isIndex = ticker === INDEX_TICKER;

  useEffect(() => {
    (async () => {
      try {
        const db = supabaseBrowser();
        const [p, r, all] = await Promise.all([
          db.from("prices").select("date,open,high,low,close,volume").eq("ticker", ticker)
            .order("date", { ascending: false }).limit(700),
          db.from("screener_latest").select("*").eq("ticker", ticker).maybeSingle(),
          fetchAll<any>((from, to) => db.from("screener_latest").select("ticker,date,ret60").order("ticker").range(from, to)),
        ]);
        if (p.error) throw new Error(p.error.message);
        if (r.error) throw new Error(r.error.message);
        setDaily(
          (p.data ?? []).reverse().map((d: any) => ({
            date: d.date, open: +d.open, high: +d.high, low: +d.low, close: +d.close, volume: +d.volume,
          }))
        );
        setRow(r.data);
        // sama persis dengan screener: tanpa indeks, hanya emiten yang ikut update terakhir
        const list = all.filter((x) => x.ticker !== INDEX_TICKER);
        const latest = list.reduce((mx, x) => (x.date > mx ? x.date : mx), "");
        const pm = percentileMap(
          list.map((x) => ({ key: x.ticker, value: x.date === latest && x.ret60 !== null ? Number(x.ret60) : null }))
        );
        setRs(pm.get(ticker) ?? null);
        setStale(!!r.data && r.data.date < latest);
      } catch (e: any) {
        setErr(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [ticker]);

  const bars = useMemo(() => (tf === "W" ? toWeekly(daily) : daily), [daily, tf]);
  const st = useMemo(() => supertrend(bars, ST_PERIOD, ST_MULT), [bars]);
  const patterns = useMemo(() => detectBullishPatterns(bars), [bars]);

  const result = useMemo(() => {
    if (isIndex || stale) return null;
    const m = metricsFromDb(row);
    return m ? scoreMetrics(m, rs) : null;
  }, [row, rs, isIndex, stale]);

  useEffect(() => {
    if (!box.current || bars.length === 0) return;

    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#475569" },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e2e8f0", scaleMargins: { top: 0.05, bottom: showVol ? 0.25 : 0.05 } },
      timeScale: { borderColor: "#e2e8f0", rightOffset: 5 },
    });

    const candle = chart.addCandlestickSeries({
      upColor: GREEN, downColor: RED, borderVisible: false, wickUpColor: GREEN, wickDownColor: RED,
    });
    candle.setData(bars.map((b) => ({ time: b.date as Time, open: b.open, high: b.high, low: b.low, close: b.close })));

    if (showVol) {
      const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      vol.setData(
        bars.map((b) => ({
          time: b.date as Time, value: b.volume,
          color: b.close >= b.open ? "rgba(5,150,105,0.45)" : "rgba(225,29,72,0.45)",
        }))
      );
    }

    const markers: SeriesMarker<Time>[] = [];
    if (showST) {
      const lineOpts = { lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      const up = chart.addLineSeries({ ...lineOpts, color: GREEN });
      const dn = chart.addLineSeries({ ...lineOpts, color: RED });
      const pad = bars.length - st.length;
      // bar tanpa nilai = titik kosong (garis terputus, seperti linebr di TradingView)
      up.setData(bars.map((b, i) => {
        const p = st[i - pad];
        return p && p.trend === 1 ? { time: b.date as Time, value: p.up } : { time: b.date as Time };
      }));
      dn.setData(bars.map((b, i) => {
        const p = st[i - pad];
        return p && p.trend === -1 ? { time: b.date as Time, value: p.dn } : { time: b.date as Time };
      }));
      for (const p of st) {
        if (!p.signal) continue;
        const buy = p.signal === "BUY";
        markers.push({
          time: p.date as Time, position: buy ? "belowBar" : "aboveBar", color: buy ? GREEN : RED,
          shape: buy ? "arrowUp" : "arrowDown", text: p.signal,
        });
      }
    }
    if (showPat) {
      const from = bars.length - 150;
      for (const pt of patterns) {
        if (pt.index < from) continue;
        markers.push({ time: bars[pt.index].date as Time, position: "belowBar", color: "#d97706", shape: "circle", text: pt.short });
      }
    }
    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    candle.setMarkers(markers);

    chart.subscribeCrosshairMove((param) => {
      const d = param.seriesData.get(candle) as any;
      if (!param.time || !d) return setLegend(null);
      const b = bars.find((x) => x.date === String(param.time));
      setLegend({ time: String(param.time), o: d.open, h: d.high, l: d.low, c: d.close, v: b?.volume });
    });

    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 150), to: bars.length + 4 });
    return () => chart.remove();
  }, [bars, st, patterns, showST, showVol, showPat]);

  const last = bars[bars.length - 1];
  const shown: Legend | null = legend ?? (last ? { time: last.date, o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume } : null);

  if (loading) return <p className="py-20 text-center text-slate-500">Memuat grafik…</p>;
  if (err) return <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Gagal memuat: {err}</p>;
  if (daily.length < 2) return <p className="py-20 text-center text-slate-500">Data {ticker} belum tersedia.</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href="/" className="rounded-lg py-1 pr-2 text-sm text-slate-500 hover:text-slate-800">← Screener</Link>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{isIndex ? "IHSG" : ticker.replace(/\.JK$/, "")}</h1>
          {isIndex && <span className="text-sm text-slate-500">Indeks Harga Saham Gabungan</span>}
          {row && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${Number(row.trend) === 1 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
              {Number(row.trend) === 1 ? "Bullish" : "Bearish"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="inline-flex shrink-0 overflow-hidden rounded-xl border border-slate-300">
            {(["D", "W"] as const).map((k) => (
              <button key={k} onClick={() => setTf(k)} aria-pressed={tf === k}
                className={`px-3.5 py-2 ${tf === k ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
                {k === "D" ? "Harian" : "Mingguan"}
              </button>
            ))}
          </div>
          <Chip on={showST} set={setShowST}>Supertrend</Chip>
          <Chip on={showVol} set={setShowVol}>Volume</Chip>
          <Chip on={showPat} set={setShowPat}>Pola bullish</Chip>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-slate-200 bg-white p-2">
          {shown && (
            <div className="flex flex-wrap gap-x-2 px-2 pb-1 text-[11px] tabular-nums text-slate-600 sm:text-xs">
              <span className="mr-1 font-medium text-slate-800">{shown.time}</span>
              <span>O {fmt.format(shown.o)}</span>
              <span>H {fmt.format(shown.h)}</span>
              <span>L {fmt.format(shown.l)}</span>
              <span className={shown.c >= shown.o ? "text-emerald-600" : "text-rose-600"}>C {fmt.format(shown.c)}</span>
              {shown.v !== undefined && <span>Vol {new Intl.NumberFormat("id-ID", { notation: "compact" }).format(shown.v)}</span>}
            </div>
          )}
          <div ref={box} className="h-[340px] w-full sm:h-[460px] lg:h-[540px]" />
          <p className="px-2 pt-1 text-[11px] text-slate-500">
            Supertrend ATR {ST_PERIOD}, multiplier {ST_MULT.toFixed(1)}, source (H+L)/2. Lingkaran kuning = pola candle bullish
            (150 bar terakhir). Scroll untuk zoom, seret untuk menggeser.
          </p>
        </div>

        <div className="space-y-4">
          {isIndex ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <h2 className="mb-1 text-sm font-semibold text-slate-700">Tentang grafik ini</h2>
              IHSG dipakai sebagai gambaran kondisi pasar. Garis hijau berarti harga di atas Supertrend (bullish), garis merah di bawahnya (bearish).
              Indeks tidak diberi skor.
            </div>
          ) : stale ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Data emiten ini tidak ikut pembaruan terakhir (tidak diperdagangkan / belum ada di file terbaru), sehingga skor tidak dihitung.
            </div>
          ) : result ? (
            <ScoreBreakdown result={result} />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Skor belum tersedia. Jalankan upload dengan “Rebuild riwayat” agar metrik dihitung.
            </div>
          )}
          {!isIndex && patterns.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">Pola bullish terbaru</h2>
              <ul className="space-y-1 text-xs text-slate-600">
                {patterns.slice(-6).reverse().map((p) => (
                  <li key={p.index} className="flex justify-between">
                    <span>{p.name}</span><span className="tabular-nums">{bars[p.index].date}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ on, set, children }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => set(!on)}
      aria-pressed={on}
      className={`shrink-0 rounded-full border px-3.5 py-2 ${on ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-500"}`}
    >
      {on ? "✓ " : ""}{children}
    </button>
  );
}

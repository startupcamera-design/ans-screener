"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ColorType, CrosshairMode, LineStyle, createChart } from "lightweight-charts";
import type { SeriesMarker, Time } from "lightweight-charts";
import { fetchAll, supabaseBrowser } from "@/lib/supabase-browser";
import { INDEX_TICKER, MIN_AVG_VALUE, ST_MULT, ST_PERIOD } from "@/lib/config";
import { supertrend } from "@/lib/supertrend";
import { detectBullishPatterns } from "@/lib/candles";
import { toWeekly } from "@/lib/timeframe";
import { metricsFromDb, VBar } from "@/lib/metrics";
import { percentileMap, scoreMetrics } from "@/lib/scoring";
import { floorToIdxTick, type PositionRow } from "@/lib/portfolio-advisor";
import ScoreBreakdown from "./ScoreBreakdown";

const GREEN = "#059669";
const RED = "#e11d48";
const SKY = "#0284c7";
const fmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const fmtCompact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

type Legend = { time: string; o: number; h: number; l: number; c: number; v?: number };

export default function StockChart({ ticker }: { ticker: string }) {
  const [daily, setDaily] = useState<VBar[]>([]);
  const [row, setRow] = useState<any>(null);
  const [rs, setRs] = useState<number | null>(null);
  const [openPos, setOpenPos] = useState<PositionRow[]>([]);
  const [stale, setStale] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [tf, setTf] = useState<"D" | "W">("D");
  const [showST, setShowST] = useState(true);
  const [showVol, setShowVol] = useState(true);
  const [showPat, setShowPat] = useState(false);
  const [legend, setLegend] = useState<Legend | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const isIndex = ticker === INDEX_TICKER;

  useEffect(() => {
    (async () => {
      try {
        const db = supabaseBrowser();
        const [p, r, all, posRes] = await Promise.all([
          db
            .from("prices")
            .select("date,open,high,low,close,volume")
            .eq("ticker", ticker)
            .order("date", { ascending: false })
            .limit(700),
          db.from("screener_latest").select("*").eq("ticker", ticker).maybeSingle(),
          fetchAll<any>((from, to) =>
            db.from("screener_latest").select("ticker,date,ret60").range(from, to)
          ),
          isIndex
            ? Promise.resolve({ data: [], error: null })
            : db
                .from("portfolio_positions")
                .select("*")
                .eq("ticker", ticker)
                .eq("status", "OPEN")
                .order("buy_date", { ascending: true }),
        ]);
        if (p.error) throw new Error(p.error.message);
        if (r.error) throw new Error(r.error.message);

        setDaily(
          (p.data ?? []).reverse().map((d: any) => ({
            date: d.date,
            open: +d.open,
            high: +d.high,
            low: +d.low,
            close: +d.close,
            volume: +d.volume,
          }))
        );
        setRow(r.data);

        if (!posRes.error && posRes.data) {
          setOpenPos(
            posRes.data.map((d: any) => ({
              id: d.id,
              ticker: d.ticker,
              buy_date: d.buy_date,
              buy_price: Number(d.buy_price),
              lots: Number(d.lots),
              sl_installed: d.sl_installed === null ? null : Number(d.sl_installed),
              notes: d.notes ?? null,
              status: d.status,
              sell_date: d.sell_date ?? null,
              sell_price: d.sell_price === null ? null : Number(d.sell_price),
            }))
          );
        }

        const list = all.filter((x) => x.ticker !== INDEX_TICKER);
        const latest = list.reduce((mx, x) => (x.date > mx ? x.date : mx), "");
        const pm = percentileMap(
          list.map((x) => ({
            key: x.ticker,
            value: x.date === latest && x.ret60 !== null ? Number(x.ret60) : null,
          }))
        );
        setRs(pm.get(ticker) ?? null);
        setStale(!!r.data && r.data.date < latest);
      } catch (e: any) {
        setErr(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [ticker, isIndex]);

  const bars = useMemo(() => (tf === "W" ? toWeekly(daily) : daily), [daily, tf]);
  const st = useMemo(() => supertrend(bars, ST_PERIOD, ST_MULT), [bars]);
  const dailySt = useMemo(() => supertrend(daily, ST_PERIOD, ST_MULT), [daily]);
  const patterns = useMemo(() => detectBullishPatterns(bars), [bars]);

  const metrics = useMemo(() => (isIndex || stale ? null : metricsFromDb(row)), [row, isIndex, stale]);
  const result = useMemo(() => (metrics ? scoreMetrics(metrics, rs) : null), [metrics, rs]);

  // Kalkulasi rencana eksekusi EOD (selaras 100% dengan fraksi BEI di Screener & PortfolioAdvisor)
  const tradePlan = useMemo(() => {
    if (isIndex || daily.length === 0 || dailySt.length === 0) return null;
    const lastBar = daily[daily.length - 1];
    const lastSt = dailySt[dailySt.length - 1];
    const bullish = lastSt.trend === 1;
    const stLine = bullish ? lastSt.up : lastSt.dn;
    const orderSl = bullish ? floorToIdxTick(lastSt.up, 1) : null;
    const slRiskPct =
      orderSl !== null && lastBar.close > 0 ? ((orderSl - lastBar.close) / lastBar.close) * 100 : null;
    const maxBuyLimit = floorToIdxTick(lastBar.close * 1.015, 0);
    return {
      bullish,
      close: lastBar.close,
      stLine,
      orderSl,
      slRiskPct,
      maxBuyLimit,
      safeRisk: slRiskPct !== null && slRiskPct >= -8,
    };
  }, [isIndex, daily, dailySt]);

  // Ringkasan posisi aktif jika saham ini sudah ada di Portofolio
  const heldSummary = useMemo(() => {
    if (openPos.length === 0 || daily.length === 0) return null;
    const lastClose = daily[daily.length - 1].close;
    const totalLots = openPos.reduce((s, p) => s + p.lots, 0);
    const totalShares = totalLots * 100;
    const totalCost = openPos.reduce((s, p) => s + p.buy_price * p.lots * 100, 0);
    const avgBuy = totalShares > 0 ? totalCost / totalShares : 0;
    const pnlRp = lastClose * totalShares - totalCost;
    const pnlPct = totalCost > 0 ? (pnlRp / totalCost) * 100 : 0;
    const latestSlInstalled = openPos[openPos.length - 1].sl_installed;
    return { totalLots, avgBuy, pnlRp, pnlPct, latestSlInstalled };
  }, [openPos, daily]);

  useEffect(() => {
    if (!box.current || bars.length === 0) return;

    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#475569" },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e2e8f0", scaleMargins: { top: 0.06, bottom: showVol ? 0.25 : 0.06 } },
      timeScale: { borderColor: "#e2e8f0", rightOffset: 6 },
    });

    const candle = chart.addCandlestickSeries({
      upColor: GREEN,
      downColor: RED,
      borderVisible: false,
      wickUpColor: GREEN,
      wickDownColor: RED,
    });
    candle.setData(
      bars.map((b) => ({ time: b.date as Time, open: b.open, high: b.high, low: b.low, close: b.close }))
    );

    if (showVol) {
      const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      vol.setData(
        bars.map((b) => ({
          time: b.date as Time,
          value: b.volume,
          color: b.close >= b.open ? "rgba(5,150,105,0.45)" : "rgba(225,29,72,0.45)",
        }))
      );
    }

    const markers: SeriesMarker<Time>[] = [];
    if (showST) {
      const lineOpts = {
        lineWidth: 2 as const,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      };
      const up = chart.addLineSeries({ ...lineOpts, color: GREEN });
      const dn = chart.addLineSeries({ ...lineOpts, color: RED });
      const pad = bars.length - st.length;

      up.setData(
        bars.map((b, i) => {
          const p = st[i - pad];
          return p && p.trend === 1 ? { time: b.date as Time, value: p.up } : { time: b.date as Time };
        })
      );
      dn.setData(
        bars.map((b, i) => {
          const p = st[i - pad];
          return p && p.trend === -1 ? { time: b.date as Time, value: p.dn } : { time: b.date as Time };
        })
      );

      // Garis acuan Order SL (fraksi BEI) di chart harian saat tren bullish
      const lastStPoint = st[st.length - 1];
      if (tf === "D" && !isIndex && lastStPoint && lastStPoint.trend === 1) {
        candle.createPriceLine({
          price: floorToIdxTick(lastStPoint.up, 1),
          color: RED,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Order SL",
        });
      }

      // Garis harga beli rata-rata jika saham ini sedang dipegang di Portofolio
      if (!isIndex && heldSummary && heldSummary.avgBuy > 0) {
        candle.createPriceLine({
          price: heldSummary.avgBuy,
          color: SKY,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `Avg Beli (${heldSummary.totalLots}L)`,
        });
      }

      for (const p of st) {
        if (!p.signal) continue;
        const buy = p.signal === "BUY";
        markers.push({
          time: p.date as Time,
          position: buy ? "belowBar" : "aboveBar",
          color: buy ? GREEN : RED,
          shape: buy ? "arrowUp" : "arrowDown",
          text: p.signal,
        });
      }
    }

    if (showPat) {
      const from = bars.length - 150;
      for (const pt of patterns) {
        if (pt.index < from) continue;
        markers.push({
          time: bars[pt.index].date as Time,
          position: "belowBar",
          color: "#d97706",
          shape: "circle",
          text: pt.short,
        });
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

    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 150), to: bars.length + 5 });
    return () => chart.remove();
  }, [bars, st, patterns, showST, showVol, showPat, tf, isIndex, heldSummary]);

  function handleCopyPlan() {
    if (!tradePlan || !tradePlan.bullish || tradePlan.orderSl === null) return;
    const clean = ticker.replace(/\.JK$/, "");
    const scoreTxt = result ? ` · Skor ${result.total}` : "";
    const text = [
      `PLAN EOD [${clean}]${scoreTxt}`,
      `- Close      : Rp ${fmtInt.format(tradePlan.close)}`,
      `- Beli Maks  : Rp ${fmtInt.format(tradePlan.maxBuyLimit)} (+1,5%)`,
      `- Order SL   : Rp ${fmtInt.format(tradePlan.orderSl)} (${tradePlan.slRiskPct?.toFixed(1)}%)`,
    ].join("\n");
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const last = bars[bars.length - 1];
  const shown: Legend | null =
    legend ?? (last ? { time: last.date, o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume } : null);

  if (loading) return <p className="py-20 text-center text-slate-500">Memuat grafik…</p>;
  if (err) return <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Gagal memuat: {err}</p>;
  if (daily.length < 2) return <p className="py-20 text-center text-slate-500">Data {ticker} belum tersedia.</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href="/" className="rounded-lg py-1 pr-2 text-sm text-slate-500 hover:text-slate-800">
            ← Screener
          </Link>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">
            {isIndex ? "IHSG" : ticker.replace(/\.JK$/, "")}
          </h1>
          {isIndex && <span className="text-sm text-slate-500">Indeks Harga Saham Gabungan</span>}
          {row && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                Number(row.trend) === 1 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              }`}
            >
              {Number(row.trend) === 1 ? "Bullish" : "Bearish"}
            </span>
          )}
          {!isIndex && rs !== null && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              RS {Math.round(rs * 100)}%
            </span>
          )}
          {heldSummary && (
            <Link
              href="/portfolio"
              className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800 hover:bg-sky-200"
            >
              Dipegang · {heldSummary.totalLots} Lot
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="inline-flex shrink-0 overflow-hidden rounded-xl border border-slate-300">
            {(["D", "W"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTf(k)}
                aria-pressed={tf === k}
                className={`px-3.5 py-2 ${tf === k ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {k === "D" ? "Harian" : "Mingguan"}
              </button>
            ))}
          </div>
          <Chip on={showST} set={setShowST}>Supertrend</Chip>
          <Chip on={showVol} set={setShowVol}>Volume</Chip>
          <Chip on={showPat} set={setShowPat}>Pola candle</Chip>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-2">
          {shown && (
            <div className="flex flex-wrap gap-x-2 px-2 pb-1 text-[11px] tabular-nums text-slate-600 sm:text-xs">
              <span className="mr-1 font-medium text-slate-800">{shown.time}</span>
              <span>O {fmt.format(shown.o)}</span>
              <span>H {fmt.format(shown.h)}</span>
              <span>L {fmt.format(shown.l)}</span>
              <span className={shown.c >= shown.o ? "text-emerald-600" : "text-rose-600"}>C {fmt.format(shown.c)}</span>
              {shown.v !== undefined && <span>Vol {fmtCompact.format(shown.v)}</span>}
            </div>
          )}
          <div ref={box} className="h-[340px] w-full sm:h-[460px] lg:h-[540px]" />
          <p className="px-2 pt-1 text-[11px] text-slate-500">
            Supertrend ATR {ST_PERIOD}, multiplier {ST_MULT.toFixed(1)}, source (H+L)/2. Garis putus-putus merah = Order SL (1 tick BEI
            di bawah garis). Scroll untuk zoom, seret untuk menggeser.
          </p>
        </div>

        <div className="space-y-4">
          {/* Kartu Posisi Aktif (muncul otomatis jika saham ini sudah dipegang di Portofolio) */}
          {!isIndex && heldSummary && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 text-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-sky-950">Posisi Aktif Anda</h2>
                <Link href="/portfolio" className="text-xs font-semibold text-sky-700 hover:underline">
                  Kelola di Portofolio →
                </Link>
              </div>
              <dl className="mt-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Jumlah & Avg Beli</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {heldSummary.totalLots} Lot @ Rp {fmtInt.format(heldSummary.avgBuy)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Floating P/L</dt>
                  <dd
                    className={`font-bold tabular-nums ${
                      heldSummary.pnlRp >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {heldSummary.pnlRp >= 0 ? "+" : ""}
                    {heldSummary.pnlPct.toFixed(1)}% ({heldSummary.pnlRp >= 0 ? "+" : ""}
                    Rp {fmtInt.format(heldSummary.pnlRp)})
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">SL Terpasang di Sekuritas</dt>
                  <dd className="font-semibold tabular-nums text-slate-800">
                    {heldSummary.latestSlInstalled ? `Rp ${fmtInt.format(heldSummary.latestSlInstalled)}` : "Belum dicatat"}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Panduan Order EOD */}
          {!isIndex && tradePlan && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Rencana order EOD</h2>
                {tradePlan.bullish && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      tradePlan.safeRisk ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {tradePlan.safeRisk ? "Risiko SL Ideal" : "Risiko SL Lebar"}
                  </span>
                )}
              </div>

              {tradePlan.bullish && tradePlan.orderSl !== null ? (
                <>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Harga close terakhir</dt>
                      <dd className="font-semibold tabular-nums text-slate-800">Rp {fmtInt.format(tradePlan.close)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Batas beli maks (+1,5%)</dt>
                      <dd className="font-semibold tabular-nums text-emerald-700">Rp {fmtInt.format(tradePlan.maxBuyLimit)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-2">
                      <dt className="text-slate-500">Order SL (1 tick BEI)</dt>
                      <dd className="font-bold tabular-nums text-rose-600">Rp {fmtInt.format(tradePlan.orderSl)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Jarak risiko SL</dt>
                      <dd
                        className={`font-semibold tabular-nums ${
                          tradePlan.safeRisk ? "text-slate-700" : "text-rose-600"
                        }`}
                      >
                        {tradePlan.slRiskPct === null ? "–" : `${tradePlan.slRiskPct.toFixed(1)}%`} (maks ideal -8%)
                      </dd>
                    </div>
                    {metrics && (
                      <div className="flex justify-between border-t border-slate-100 pt-2">
                        <dt className="text-slate-500">Likuiditas (rata2 20h)</dt>
                        <dd
                          className={`font-medium tabular-nums ${
                            metrics.avgValue20 >= MIN_AVG_VALUE ? "text-slate-700" : "text-rose-600"
                          }`}
                        >
                          Rp {fmtCompact.format(metrics.avgValue20)}/hari
                        </dd>
                      </div>
                    )}
                  </dl>

                  <button
                    onClick={handleCopyPlan}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-slate-50 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {copied ? "✓ Rencana Order Disalin" : "Salin Rencana Order"}
                  </button>
                </>
              ) : (
                <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  Tren sedang <b>Bearish</b> (di bawah garis {fmtInt.format(tradePlan.stLine)}). Tidak disarankan untuk posisi beli baru.
                </p>
              )}
            </div>
          )}

          {isIndex ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <h2 className="mb-1 text-sm font-semibold text-slate-700">Tentang grafik IHSG</h2>
              IHSG dipakai sebagai penentu rezim pasar. Garis hijau berarti harga di atas Supertrend (bullish), garis merah di
              bawahnya (bearish).
            </div>
          ) : stale ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Data emiten ini tidak ikut pembaruan terakhir (tidak diperdagangkan / belum ada di file terbaru), sehingga skor tidak
              dihitung.
            </div>
          ) : result ? (
            <ScoreBreakdown result={result} />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Skor belum tersedia. Jalankan upload dengan “Rebuild riwayat” agar metrik dihitung.
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
      className={`shrink-0 rounded-full border px-3.5 py-2 ${
        on ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-500"
      }`}
    >
      {on ? "✓ " : ""}
      {children}
    </button>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ST_MULT, ST_PERIOD } from "@/lib/config";

type Price = { date: string; open: number; high: number; low: number; close: number };
type ST = { date: string; trend: 1 | -1; lower: number; upper: number };

const GREEN = "#059669";
const RED = "#e11d48";
const idNum = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const idPrice = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

export default function TickerDetail({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [prices, setPrices] = useState<Price[]>([]);
  const [st, setSt] = useState<ST[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const db = supabaseBrowser();
        const [p, s] = await Promise.all([
          db
            .from("prices")
            .select("date,open,high,low,close")
            .eq("ticker", ticker)
            .order("date", { ascending: false })
            .limit(60),
          db
            .from("supertrend_daily")
            .select("date,trend,lower,upper")
            .eq("ticker", ticker)
            .order("date", { ascending: false })
            .limit(60),
        ]);
        if (p.error || s.error) throw new Error((p.error ?? s.error)!.message);
        setPrices(
          (p.data ?? [])
            .map((d: any) => ({
              date: d.date,
              open: +d.open,
              high: +d.high,
              low: +d.low,
              close: +d.close,
            }))
            .reverse()
        );
        setSt(
          (s.data ?? [])
            .map((d: any) => ({
              date: d.date,
              trend: +d.trend as 1 | -1,
              lower: +d.lower,
              upper: +d.upper,
            }))
            .reverse()
        );
      } catch (e: any) {
        setErr(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [ticker]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const summary = useMemo(() => {
    if (prices.length === 0) return null;
    const lastP = prices[prices.length - 1];
    const prevP = prices.length > 1 ? prices[prices.length - 2] : null;
    const lastSt = st.find((x) => x.date === lastP.date) ?? st[st.length - 1] ?? null;

    const bullish = lastSt ? lastSt.trend === 1 : null;
    const stLine = lastSt ? (lastSt.trend === 1 ? lastSt.lower : lastSt.upper) : null;
    const slRiskPct =
      bullish && stLine !== null && lastP.close > 0 ? ((stLine - lastP.close) / lastP.close) * 100 : null;
    const chgPct = prevP && prevP.close > 0 ? ((lastP.close - prevP.close) / prevP.close) * 100 : null;

    return {
      date: lastP.date,
      close: lastP.close,
      chgPct,
      bullish,
      stLine,
      slRiskPct,
      maxBuyLimit: lastP.close * 1.015,
      safeRisk: slRiskPct !== null && slRiskPct >= -8,
    };
  }, [prices, st]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail ${ticker}`}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header Modal */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {ticker.replace(/\.JK$/, "")}
                <span className="text-sm font-normal text-slate-400">.JK</span>
              </h2>
              {summary && summary.bullish !== null && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    summary.bullish ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {summary.bullish ? "Bullish" : "Bearish"}
                </span>
              )}
            </div>
            {summary && (
              <div className="mt-1 flex items-baseline gap-2 text-sm">
                <span className="text-lg font-bold tabular-nums text-slate-800">
                  Rp {idNum.format(summary.close)}
                </span>
                {summary.chgPct !== null && (
                  <span
                    className={`font-semibold tabular-nums ${
                      summary.chgPct > 0
                        ? "text-emerald-600"
                        : summary.chgPct < 0
                        ? "text-rose-600"
                        : "text-slate-500"
                    }`}
                  >
                    {summary.chgPct > 0 ? "+" : ""}
                    {idNum.format(summary.chgPct)}%
                  </span>
                )}
                <span className="text-xs text-slate-400">· {fmtDate(summary.date)}</span>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Kartu Ringkasan Order EOD (khusus saat tren Bullish) */}
        {summary && summary.bullish && summary.stLine !== null && (
          <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs">
            <div>
              <div className="text-slate-500">Batas Beli (+1,5%)</div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700">
                Rp {idPrice.format(summary.maxBuyLimit)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Garis SL (ST)</div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-rose-600">
                Rp {idPrice.format(summary.stLine)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Risiko SL</div>
              <div
                className={`mt-0.5 text-sm font-bold tabular-nums ${
                  summary.safeRisk ? "text-slate-800" : "text-rose-600"
                }`}
              >
                {summary.slRiskPct === null ? "–" : `${summary.slRiskPct.toFixed(1)}%`}
                <span className="ml-1 text-[10px] font-medium">
                  {summary.safeRisk ? "(Aman)" : "(Lebar)"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Area Grafik Candlestick */}
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/40 p-2">
          {loading ? (
            <div className="h-60 animate-pulse rounded-lg bg-slate-100" />
          ) : err ? (
            <p className="py-10 text-center text-sm text-rose-600">{err}</p>
          ) : prices.length < 2 ? (
            <p className="py-10 text-center text-sm text-slate-500">Data belum cukup untuk menampilkan grafik…</p>
          ) : (
            <CandleChart prices={prices} st={st} />
          )}
        </div>

        {/* Footer & Link ke Halaman Detail Lengkap */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Supertrend ATR {ST_PERIOD}, mult {ST_MULT.toFixed(1)} (60 bar terakhir).
          </span>
          <Link
            href={`/stock/${encodeURIComponent(ticker)}`}
            onClick={onClose}
            className="font-semibold text-emerald-700 hover:underline"
          >
            Lihat rincian skor & chart penuh →
          </Link>
        </div>
      </div>
    </div>
  );
}

function CandleChart({ prices, st }: { prices: Price[]; st: ST[] }) {
  const W = 640;
  const H = 250;
  const PAD_X = 12;
  const PAD_Y = 22;

  const stMap = new Map(st.map((s) => [s.date, s]));
  const stLines = prices.map((p) => {
    const s = stMap.get(p.date);
    return s ? (s.trend === 1 ? s.lower : s.upper) : null;
  });

  const vals = [
    ...prices.map((p) => p.high),
    ...prices.map((p) => p.low),
    ...stLines.filter((v): v is number => v !== null),
  ];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;

  const step = (W - PAD_X * 2) / Math.max(1, prices.length);
  const candleW = Math.max(3, Math.min(7.5, step * 0.62));
  const cx = (i: number) => PAD_X + step * i + step / 2;
  const y = (v: number) => H - PAD_Y - ((v - min) / span) * (H - PAD_Y * 2);

  // Segmen garis Supertrend berwarna sesuai arah tren
  const segs: { d: string; color: string }[] = [];
  for (let i = 1; i < prices.length; i++) {
    const a = stMap.get(prices[i - 1].date);
    const b = stMap.get(prices[i].date);
    if (!a || !b || a.trend !== b.trend) continue;
    const va = a.trend === 1 ? a.lower : a.upper;
    const vb = b.trend === 1 ? b.lower : b.upper;
    segs.push({
      d: `M${cx(i - 1).toFixed(1)},${y(va).toFixed(1)} L${cx(i).toFixed(1)},${y(vb).toFixed(1)}`,
      color: a.trend === 1 ? GREEN : RED,
    });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Grafik candlestick dan Supertrend">
      {/* Garis bantu atas & bawah */}
      <line x1={PAD_X} y1={PAD_Y} x2={W - PAD_X} y2={PAD_Y} stroke="#e2e8f0" strokeDasharray="3 3" />
      <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} stroke="#e2e8f0" strokeDasharray="3 3" />

      {/* Garis Supertrend */}
      {segs.map((s, i) => (
        <path key={`st-${i}`} d={s.d} stroke={s.color} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      ))}

      {/* Candlestick OHLC */}
      {prices.map((p, i) => {
        const xCenter = cx(i);
        const isUp = p.close >= p.open;
        const color = isUp ? GREEN : RED;
        const bodyTop = Math.min(y(p.open), y(p.close));
        const bodyHeight = Math.max(1.5, Math.abs(y(p.close) - y(p.open)));

        return (
          <g key={p.date}>
            <line
              x1={xCenter}
              y1={y(p.high)}
              x2={xCenter}
              y2={y(p.low)}
              stroke={color}
              strokeWidth={1.1}
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

      {/* Label harga & tanggal */}
      <text x={PAD_X} y={14} fontSize="11" fill="#64748b">
        High: {idNum.format(max)}
      </text>
      <text x={PAD_X} y={H - 6} fontSize="11" fill="#64748b">
        Low: {idNum.format(min)}
      </text>
      <text x={W - PAD_X} y={H - 6} fontSize="11" fill="#64748b" textAnchor="end">
        {fmtDate(prices[0].date)} – {fmtDate(prices[prices.length - 1].date)}
      </text>
    </svg>
  );
}
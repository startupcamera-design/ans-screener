"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Price = { date: string; close: number };
type ST = { date: string; trend: 1 | -1; lower: number; upper: number };

export default function TickerDetail({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [prices, setPrices] = useState<Price[]>([]);
  const [st, setSt] = useState<ST[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const db = supabaseBrowser();
      const [p, s] = await Promise.all([
        db.from("prices").select("date,close").eq("ticker", ticker).order("date", { ascending: false }).limit(90),
        db.from("supertrend_daily").select("date,trend,lower,upper").eq("ticker", ticker).order("date", { ascending: false }).limit(90),
      ]);
      if (p.error || s.error) return setErr((p.error ?? s.error)!.message);
      setPrices((p.data ?? []).map((d: any) => ({ date: d.date, close: +d.close })).reverse());
      setSt((s.data ?? []).map((d: any) => ({ date: d.date, trend: +d.trend as 1 | -1, lower: +d.lower, upper: +d.upper })).reverse());
    })();
  }, [ticker]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{ticker}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Tutup">✕</button>
        </div>
        {err ? (
          <p className="text-sm text-rose-600">{err}</p>
        ) : prices.length < 2 ? (
          <p className="py-10 text-center text-sm text-slate-500">Memuat / data belum cukup…</p>
        ) : (
          <Chart prices={prices} st={st} />
        )}
        <p className="mt-2 text-xs text-slate-500">
          Garis abu = harga penutupan. Garis Supertrend hanya tersedia untuk bar yang sudah tersimpan
          (gunakan “Rebuild riwayat” saat upload untuk memperpanjang).
        </p>
      </div>
    </div>
  );
}

function Chart({ prices, st }: { prices: Price[]; st: ST[] }) {
  const W = 640, H = 260, PAD = 28;
  const stMap = new Map(st.map((s) => [s.date, s]));
  const vals = [
    ...prices.map((p) => p.close),
    ...st.flatMap((s) => [s.trend === 1 ? s.lower : s.upper]),
  ];
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (prices.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const closePath = prices.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(" ");

  // segmen Supertrend, diwarnai per arah tren
  const segs: { d: string; color: string }[] = [];
  for (let i = 1; i < prices.length; i++) {
    const a = stMap.get(prices[i - 1].date), b = stMap.get(prices[i].date);
    if (!a || !b || a.trend !== b.trend) continue;
    const va = a.trend === 1 ? a.lower : a.upper, vb = b.trend === 1 ? b.lower : b.upper;
    segs.push({
      d: `M${x(i - 1).toFixed(1)},${y(va).toFixed(1)} L${x(i).toFixed(1)},${y(vb).toFixed(1)}`,
      color: a.trend === 1 ? "#059669" : "#e11d48",
    });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Grafik harga dan Supertrend">
      <path d={closePath} fill="none" stroke="#64748b" strokeWidth={1.5} />
      {segs.map((s, i) => (
        <path key={i} d={s.d} stroke={s.color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      ))}
      <text x={PAD} y={14} fontSize="11" fill="#64748b">{max.toLocaleString("id-ID")}</text>
      <text x={PAD} y={H - 8} fontSize="11" fill="#64748b">{min.toLocaleString("id-ID")}</text>
      <text x={W - PAD} y={H - 8} fontSize="11" fill="#64748b" textAnchor="end">{prices[prices.length - 1].date}</text>
    </svg>
  );
}

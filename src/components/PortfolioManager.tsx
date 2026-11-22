"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ST_MULT, ST_PERIOD } from "@/lib/config";
import { supertrend } from "@/lib/supertrend";
import type { VBar } from "@/lib/metrics";
import {
  computePerformanceStats,
  evaluatePosition,
  floorToIdxTick,
  type PositionAdvice,
  type PositionRow,
} from "@/lib/portfolio-advisor";

const fmtInt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const fmtDec = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

type EnrichedPosition = {
  pos: PositionRow;
  advice: PositionAdvice | null;
};

export default function PortfolioManager() {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [barsMap, setBarsMap] = useState<Record<string, VBar[]>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Form tambah posisi
  const [showAdd, setShowAdd] = useState(false);
  const [tickerInput, setTickerInput] = useState("");
  const [buyDate, setBuyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [buyPrice, setBuyPrice] = useState("");
  const [lots, setLots] = useState("");
  const [slInstalled, setSlInstalled] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Modal tutup posisi (catat jual)
  const [closingPos, setClosingPos] = useState<EnrichedPosition | null>(null);
  const [sellDate, setSellDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sellPrice, setSellPrice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const db = supabaseBrowser();
      const { data: posData, error: posErr } = await db
        .from("portfolio_positions")
        .select("*")
        .order("status", { ascending: false })
        .order("buy_date", { ascending: false });

      if (posErr) throw new Error(posErr.message);

      const list: PositionRow[] = (posData ?? []).map((d: any) => ({
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
      }));
      setPositions(list);

      const openTickers = Array.from(new Set(list.filter((p) => p.status === "OPEN").map((p) => p.ticker)));
      if (openTickers.length > 0) {
        const results = await Promise.all(
          openTickers.map((t) =>
            db
              .from("prices")
              .select("ticker,date,open,high,low,close,volume")
              .eq("ticker", t)
              .order("date", { ascending: false })
              .limit(150)
          )
        );
        const map: Record<string, VBar[]> = {};
        results.forEach((res, idx) => {
          if (res.data) {
            map[openTickers[idx]] = res.data
              .map((d: any) => ({
                date: d.date,
                open: +d.open,
                high: +d.high,
                low: +d.low,
                close: +d.close,
                volume: +d.volume,
              }))
              .reverse();
          }
        });
        setBarsMap(map);
      } else {
        setBarsMap({});
      }
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Urutkan posisi OPEN: yang kritis / perlu aksi tampil lebih dulu
  const enrichedOpen: EnrichedPosition[] = useMemo(() => {
    return positions
      .filter((p) => p.status === "OPEN")
      .map((pos) => {
        const bars = barsMap[pos.ticker] ?? [];
        const st = bars.length >= ST_PERIOD ? supertrend(bars, ST_PERIOD, ST_MULT) : [];
        const advice = evaluatePosition(pos, bars, st);
        return { pos, advice };
      })
      .sort((a, b) => (a.advice?.healthScore ?? 50) - (b.advice?.healthScore ?? 50));
  }, [positions, barsMap]);

  const closedList = useMemo(() => positions.filter((p) => p.status === "CLOSED"), [positions]);
const perfStats = useMemo(() => computePerformanceStats(closedList), [closedList]);

  const totals = useMemo(() => {
    let modal = 0;
    let nilai = 0;
    let actionNeeded = 0;
    for (const item of enrichedOpen) {
      const m = item.pos.buy_price * item.pos.lots * 100;
      modal += m;
      nilai += item.advice ? item.advice.marketValue : m;
      if (item.advice && item.advice.code !== "HOLD") actionNeeded++;
    }
    const pnl = nilai - modal;
    const pnlPct = modal > 0 ? (pnl / modal) * 100 : 0;
    return { modal, nilai, pnl, pnlPct, actionNeeded };
  }, [enrichedOpen]);

  async function handleAddPosition(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      let cleanTicker = tickerInput.trim().toUpperCase();
      if (!cleanTicker) throw new Error("Ticker wajib diisi.");
      if (!cleanTicker.endsWith(".JK") && cleanTicker !== "COMPOSITE") {
        cleanTicker = `${cleanTicker}.JK`;
      }
      const priceNum = Number(buyPrice.replace(/\./g, "").replace(",", "."));
      const lotsNum = parseInt(lots, 10);
      const slNum = slInstalled.trim() ? Number(slInstalled.replace(/\./g, "").replace(",", ".")) : null;

      if (!Number.isFinite(priceNum) || priceNum <= 0) throw new Error("Harga beli tidak valid.");
      if (!Number.isFinite(lotsNum) || lotsNum <= 0) throw new Error("Jumlah lot tidak valid.");

      const db = supabaseBrowser();
      const { error } = await db.from("portfolio_positions").insert({
        ticker: cleanTicker,
        buy_date: buyDate,
        buy_price: priceNum,
        lots: lotsNum,
        sl_installed: slNum,
        notes: notes.trim() || null,
        status: "OPEN",
      });
      if (error) throw new Error(error.message);

      setTickerInput("");
      setBuyPrice("");
      setLots("");
      setSlInstalled("");
      setNotes("");
      setShowAdd(false);
      await loadData();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateSl(posId: string, newSl: number) {
    try {
      const db = supabaseBrowser();
      const { error } = await db
        .from("portfolio_positions")
        .update({ sl_installed: newSl })
        .eq("id", posId);
      if (error) throw new Error(error.message);
      await loadData();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  async function handleConfirmClose(e: React.FormEvent) {
    e.preventDefault();
    if (!closingPos) return;
    setSaving(true);
    try {
      const sPrice = Number(sellPrice.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(sPrice) || sPrice <= 0) throw new Error("Harga jual tidak valid.");

      const db = supabaseBrowser();
      const { error } = await db
        .from("portfolio_positions")
        .update({
          status: "CLOSED",
          sell_date: sellDate,
          sell_price: sPrice,
        })
        .eq("id", closingPos.pos.id);
      if (error) throw new Error(error.message);

      setClosingPos(null);
      setSellPrice("");
      await loadData();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(posId: string) {
    if (!confirm("Hapus catatan posisi ini secara permanen?")) return;
    const db = supabaseBrowser();
    await db.from("portfolio_positions").delete().eq("id", posId);
    await loadData();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
              ← Screener
            </Link>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">Portofolio & Aksi Besok</h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 md:text-sm">
            Evaluasi otomatis posisi terbuka berdasarkan Supertrend ATR {ST_PERIOD} (mult {ST_MULT}) & horizon 10–20 hari bursa.
          </p>
        </div>

        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {showAdd ? "Tutup Form" : "+ Catat Beli Baru"}
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700">
          {err}
        </div>
      )}

      {/* Form Tambah Posisi */}
      {showAdd && (
        <form
          onSubmit={handleAddPosition}
          className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm md:p-5"
        >
          <h2 className="text-sm font-bold text-slate-800">Catat Transaksi Beli Baru</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Ticker</span>
              <input
                required
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                placeholder="mis. BBCA"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Tanggal Beli</span>
              <input
                required
                type="date"
                value={buyDate}
                onChange={(e) => setBuyDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Harga Beli (Rp)</span>
              <input
                required
                inputMode="numeric"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder="mis. 9500"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Jumlah Lot</span>
              <input
                required
                inputMode="numeric"
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                placeholder="mis. 10"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">SL Terpasang (Opsional)</span>
              <input
                inputMode="numeric"
                value={slInstalled}
                onChange={(e) => setSlInstalled(e.target.value)}
                placeholder="kosongkan jika belum"
                className={inputCls}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan setup (opsional), mis. Top Pick Skor 91"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <button
              disabled={saving}
              type="submit"
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan ke Portofolio"}
            </button>
          </div>
        </form>
      )}

      {/* Kartu Ringkasan Portofolio */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Modal Aktif ({enrichedOpen.length} saham)</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-slate-900 md:text-xl">
            Rp {fmtInt.format(totals.modal)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Nilai Pasar Saat Ini</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-slate-900 md:text-xl">
            Rp {fmtInt.format(totals.nilai)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Floating P/L</div>
          <div
            className={`mt-1 text-lg font-bold tabular-nums md:text-xl ${
              totals.pnl > 0 ? "text-emerald-600" : totals.pnl < 0 ? "text-rose-600" : "text-slate-700"
            }`}
          >
            {totals.pnl > 0 ? "+" : ""}
            Rp {fmtInt.format(totals.pnl)}{" "}
            <span className="text-xs font-semibold">({totals.pnlPct >= 0 ? "+" : ""}{fmtDec.format(totals.pnlPct)}%)</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Perlu Aksi Besok</div>
          <div className={`mt-1 text-lg font-bold tabular-nums md:text-xl ${totals.actionNeeded > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {totals.actionNeeded} posisi
          </div>
        </div>
      </div>
{/* Panel Statistik Performa Nyata (Realized Win Rate, Expectancy & Penambahan Portofolio Bersih) */}
<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
  <div className="flex flex-wrap items-center justify-between gap-2">
    <div>
      <h2 className="text-sm font-bold text-slate-900">Statistik Perform (Realized)</h2>
      <p className="text-xs text-slate-500">
        Dihitung otomatis dari {perfStats.totalTrades} transaksi yang sudah selesai ditutup.
      </p>
    </div>
    {perfStats.totalTrades > 0 && (
      <span
        className={`rounded-full px-3 py-1 text-xs font-bold ${
          perfStats.expectancyPct > 0
            ? "bg-emerald-100 text-emerald-800"
            : "bg-rose-100 text-rose-800"
        }`}
      >
        {perfStats.expectancyPct > 0
          ? "Expectancy Positif · Strategi Menghasilkan"
          : "Expectancy Negatif · Evaluasi Disiplin SL"}
      </span>
    )}
  </div>

  {perfStats.totalTrades === 0 ? (
    <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
      Belum ada transaksi yang ditutup (<i>CLOSED</i>). Setelah Anda menutup posisi pertama lewat tombol{" "}
      <b>Catat Jual</b>, Win Rate, Expectancy, dan Penambahan Portofolio Bersih akan otomatis muncul di sini.
    </p>
  ) : (
    <>
      <div className="mt-3.5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {/* 1. Penambahan Portofolio Bersih */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="text-[11px] font-medium text-slate-500">Penambahan Portofolio Bersih</div>
          <div
            className={`mt-1 text-base font-bold tabular-nums md:text-lg ${
              perfStats.realizedNetRp > 0
                ? "text-emerald-600"
                : perfStats.realizedNetRp < 0
                ? "text-rose-600"
                : "text-slate-800"
            }`}
          >
            {perfStats.realizedNetRp > 0 ? "+" : ""}
            Rp {fmtInt.format(perfStats.realizedNetRp)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Total bersih (Realized + Floating):{" "}
            <b
              className={
                perfStats.realizedNetRp + totals.pnl >= 0 ? "text-emerald-700" : "text-rose-700"
              }
            >
              {perfStats.realizedNetRp + totals.pnl >= 0 ? "+" : ""}
              Rp {fmtInt.format(perfStats.realizedNetRp + totals.pnl)}
            </b>
          </div>
        </div>

        {/* 2. Win Rate Aktual */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="text-[11px] font-medium text-slate-500">Win Rate Aktual</div>
          <div className="mt-1 text-base font-bold tabular-nums text-slate-900 md:text-lg">
            {fmtDec.format(perfStats.winRatePct)}%
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            <span className="font-semibold text-emerald-600">{perfStats.wins} Win</span> ·{" "}
            <span className="font-semibold text-rose-600">{perfStats.losses} Loss</span> (dari{" "}
            {perfStats.totalTrades} trade)
          </div>
        </div>

        {/* 3. Expectancy per Transaksi */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="text-[11px] font-medium text-slate-500">Expectancy / Transaksi</div>
          <div
            className={`mt-1 text-base font-bold tabular-nums md:text-lg ${
              perfStats.expectancyPct >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {perfStats.expectancyPct >= 0 ? "+" : ""}
            {fmtDec.format(perfStats.expectancyPct)}%
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-slate-500">
            Rata-rata{" "}
            <b>
              {perfStats.expectancyRp >= 0 ? "+" : ""}
              Rp {fmtInt.format(perfStats.expectancyRp)}
            </b>{" "}
            / trade
          </div>
        </div>

        {/* 4. Rasio Rata-rata Win vs Loss & Profit Factor */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="text-[11px] font-medium text-slate-500">Avg Win vs Avg Loss</div>
          <div className="mt-1 text-sm font-bold tabular-nums md:text-base">
            <span className="text-emerald-600">+{fmtDec.format(perfStats.avgWinPct)}%</span>
            <span className="mx-1 text-slate-400">/</span>
            <span className="text-rose-600">-{fmtDec.format(perfStats.avgLossPct)}%</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Profit Factor:{" "}
            <b>{perfStats.profitFactor === null ? "∞" : fmtDec.format(perfStats.profitFactor)}</b> ·
            Rata-rata {perfStats.avgHoldDays} hari
          </div>
        </div>
      </div>

      {/* Sorotan Trade Terbaik & Terburuk */}
      {(perfStats.bestTrade || perfStats.worstTrade) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-slate-100 pt-2.5 text-xs text-slate-600">
          {perfStats.bestTrade && (
            <span>
              Trade terbaik:{" "}
              <b className="text-emerald-700">
                {perfStats.bestTrade.ticker} (+{fmtDec.format(perfStats.bestTrade.pnlPct)}% / +Rp{" "}
                {fmtInt.format(perfStats.bestTrade.pnlRp)})
              </b>
            </span>
          )}
          {perfStats.worstTrade && perfStats.worstTrade.pnlRp < 0 && (
            <span>
              Loss terbesar:{" "}
              <b className="text-rose-600">
                {perfStats.worstTrade.ticker} ({fmtDec.format(perfStats.worstTrade.pnlPct)}% / Rp{" "}
                {fmtInt.format(perfStats.worstTrade.pnlRp)})
              </b>
            </span>
          )}
        </div>
      )}
    </>
  )}
</section>
      {/* Daftar Posisi Terbuka */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      ) : enrichedOpen.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <p className="font-semibold text-slate-700">Belum ada posisi terbuka di portofolio</p>
          <p className="mt-1 text-sm text-slate-500">
            Klik <b>+ Catat Beli Baru</b> setelah order beli Anda match di sekuritas.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {enrichedOpen.map(({ pos, advice }) => {
            const cleanTicker = pos.ticker.replace(/\.JK$/, "");
            return (
              <div
                key={pos.id}
                className={`overflow-hidden rounded-2xl border-2 p-4 shadow-sm transition-all md:p-5 ${
                  advice ? `${advice.borderCls} ${advice.cardTintCls}` : "border-slate-200 bg-white"
                }`}
              >
                {/* Baris Atas: Ticker + Badge Keputusan Besok */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link
                        href={`/stock/${encodeURIComponent(pos.ticker)}`}
                        className="text-xl font-bold tracking-tight text-slate-900 hover:text-emerald-700"
                      >
                        {cleanTicker}
                      </Link>
                      <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                        {pos.lots} Lot
                      </span>
                      <span className="text-xs text-slate-500">
                        Beli {fmtDate(pos.buy_date)} @ <b>Rp {fmtInt.format(pos.buy_price)}</b>
                      </span>
                    </div>
                    {pos.notes && <p className="mt-0.5 text-xs text-slate-500">Catatan: {pos.notes}</p>}
                  </div>

                  {advice && (
                    <span className={`rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wide shadow-sm ${advice.badgeCls}`}>
                      {advice.badge}
                    </span>
                  )}
                </div>

{/* Meteran Gradasi Kesehatan Posisi (Merah -> Kuning -> Hijau) + Rincian Penyebab */}
{advice && (
  <div className="mt-3.5 rounded-xl border border-slate-200/70 bg-white/95 px-3.5 py-3">
    <div className="flex items-center justify-between text-xs">
      <span className="font-semibold text-slate-700">Status Kesehatan Posisi</span>
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${advice.healthColorCls}`}>
        {advice.healthLabel} ({advice.healthScore}/100)
      </span>
    </div>

    {/* Bar Spektrum Gradasi */}
    <div className="relative mt-2 h-2.5 w-full rounded-full bg-gradient-to-r from-rose-600 via-amber-400 to-emerald-600">
      <div
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-900 bg-white shadow-md transition-all"
        style={{ left: `${advice.healthScore}%` }}
        title={`Skor Kesehatan: ${advice.healthScore}/100`}
      />
    </div>

    <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-400">
      <span>Kritis / Jual</span>
      <span>Waspada / Stagnan</span>
      <span>Sangat Aman</span>
    </div>

    {/* Ringkasan Chip Penyebab Skor */}
    <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
      {advice.healthReasons.map((r, idx) => {
        const isPos = r.delta > 0 && r.label !== "Tren Supertrend Bullish";
        const isNeg = r.delta < 0;
        const chipCls = isNeg
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : isPos
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-slate-50 text-slate-600 border-slate-200";
        const deltaText =
          r.label === "Tren Supertrend Bullish"
            ? "Dasar 68"
            : r.delta > 0
            ? `+${r.delta}`
            : r.delta < 0
            ? `${r.delta}`
            : "0";

        return (
          <span
            key={idx}
            title={r.detail}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${chipCls}`}
          >
            <span>{r.label}</span>
            <b className="tabular-nums">({deltaText})</b>
          </span>
        );
      })}
    </div>

    {/* Rincian Penjelasan Lengkap (Opsional Buka-Tutup) */}
    <details className="mt-2 text-[11px] text-slate-500">
      <summary className="cursor-pointer select-none font-medium text-slate-500 hover:text-slate-700">
        Lihat penjelasan faktor skor
      </summary>
      <ul className="mt-1.5 space-y-1 pl-1">
        {advice.healthReasons.map((r, idx) => (
          <li key={idx} className="flex items-start justify-between gap-2">
            <span>
              • <b className="text-slate-700">{r.label}:</b> {r.detail}
            </span>
            <span
              className={`shrink-0 font-bold tabular-nums ${
                r.delta < 0 ? "text-rose-600" : r.delta > 0 ? "text-emerald-600" : "text-slate-500"
              }`}
            >
              {r.delta > 0 ? `+${r.delta}` : r.delta}
            </span>
          </li>
        ))}
      </ul>
    </details>
  </div>
)}

                {/* Kotak Rekomendasi Tindakan Besok */}
                {advice ? (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-white/80 p-3.5">
                    <div className="text-sm font-bold text-slate-900">{advice.headline}</div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{advice.detail}</p>

                    {/* Metrik Posisi */}
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200/80 pt-3 text-xs sm:grid-cols-5">
                      <div>
                        <span className="text-slate-500">Harga Terakhir</span>
                        <div className="mt-0.5 font-bold tabular-nums text-slate-800">
                          Rp {fmtInt.format(advice.currentPrice)}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Floating P/L</span>
                        <div
                          className={`mt-0.5 font-bold tabular-nums ${
                            advice.pnlRp >= 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {advice.pnlRp >= 0 ? "+" : ""}
                          {fmtDec.format(advice.pnlPct)}% ({advice.pnlRp >= 0 ? "+" : ""}
                          {fmtInt.format(advice.pnlRp)})
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">SL Terpasang</span>
                        <div className="mt-0.5 font-bold tabular-nums text-slate-800">
                          {pos.sl_installed ? `Rp ${fmtInt.format(pos.sl_installed)}` : "Belum dicatat"}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Acuan SL Baru (ST)</span>
                        <div className="mt-0.5 font-bold tabular-nums text-rose-600">
                          {advice.suggestedSl ? `Rp ${fmtInt.format(advice.suggestedSl)}` : "–"}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Usia Pegang</span>
                        <div className="mt-0.5 font-bold tabular-nums text-slate-800">
                          {advice.holdingBars} hari bursa
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    Data harga historis belum cukup untuk menghitung sinyal Supertrend saham ini.
                  </p>
                )}

                {/* Tombol Aksi */}
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {advice && advice.suggestedSl !== null && advice.suggestedSl !== pos.sl_installed && (
                      <button
                        onClick={() => handleUpdateSl(pos.id, advice.suggestedSl!)}
                        className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        ✓ Konfirmasi SL Sudah Digeser ke Rp {fmtInt.format(advice.suggestedSl)}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setClosingPos({ pos, advice });
                        setSellPrice(
                          advice
                            ? String(floorToIdxTick(advice.currentPrice))
                            : String(pos.buy_price)
                        );
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Catat Jual / Tutup Posisi
                    </button>
                  </div>

                  <button
                    onClick={() => handleDelete(pos.id)}
                    className="text-xs text-slate-400 hover:text-rose-600"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Riwayat Posisi yang Sudah Ditutup */}
      {closedList.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold text-slate-700">
            Riwayat Posisi Selesai ({closedList.length} transaksi)
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Ticker</th>
                  <th className="px-3 py-2">Periode</th>
                  <th className="px-3 py-2 text-right">Lot</th>
                  <th className="px-3 py-2 text-right">Beli</th>
                  <th className="px-3 py-2 text-right">Jual</th>
                  <th className="px-3 py-2 text-right">Realized P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closedList.map((c) => {
                  const sPrice = c.sell_price ?? c.buy_price;
                  const pnl = (sPrice - c.buy_price) * c.lots * 100;
                  const pct = ((sPrice - c.buy_price) / c.buy_price) * 100;
                  return (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-semibold">{c.ticker.replace(/\.JK$/, "")}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {fmtDate(c.buy_date)} – {c.sell_date ? fmtDate(c.sell_date) : "–"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.lots}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInt.format(c.buy_price)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInt.format(sPrice)}</td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {pnl >= 0 ? "+" : ""}
                        {fmtInt.format(pnl)} ({pct >= 0 ? "+" : ""}{fmtDec.format(pct)}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Modal Catat Jual */}
      {closingPos && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setClosingPos(null)}
        >
          <form
            onSubmit={handleConfirmClose}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900">
              Tutup Posisi {closingPos.pos.ticker.replace(/\.JK$/, "")} ({closingPos.pos.lots} Lot)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Tanggal Jual</span>
                <input
                  required
                  type="date"
                  value={sellDate}
                  onChange={(e) => setSellDate(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Harga Jual (Rp)</span>
                <input
                  required
                  inputMode="numeric"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClosingPos(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-600"
              >
                Batal
              </button>
              <button
                disabled={saving}
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {saving ? "Menyimpan..." : "Simpan Realisasi"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";
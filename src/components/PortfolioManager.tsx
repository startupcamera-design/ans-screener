"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchAll, supabaseBrowser } from "@/lib/supabase-browser";
import { INDEX_TICKER, MIN_AVG_VALUE, ST_MULT, ST_PERIOD } from "@/lib/config";
import { supertrend } from "@/lib/supertrend";
import { metricsFromDb, type VBar } from "@/lib/metrics";
import { percentileMap, scoreMetrics } from "@/lib/scoring";
import {
  buildMorningActionText,
  computePerformanceStats,
  computePositionSizing,
  DEFAULT_TRADING_PREFS,
  evaluatePosition,
  EXIT_REASON_LABELS,
  EXIT_REASON_OPTIONS,
  floorToIdxTick,
  loadTradingPrefs,
  saveTradingPrefs,
  type ExitReason,
  type MorningBuyCandidate,
  type PositionAdvice,
  type PositionRow,
  type TradingPrefs,
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
  const [ihsgBullish, setIhsgBullish] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<TradingPrefs>(DEFAULT_TRADING_PREFS);
  const [scoreByTicker, setScoreByTicker] = useState<Record<string, number>>({});
  const [screenerTopPicks, setScreenerTopPicks] = useState<
    { ticker: string; score: number; close: number; slTickPrice: number; maxBuyPrice: number }[]
  >([]);
  const [latestMarketDate, setLatestMarketDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Panel pengaturan modal & risiko
  const [showPrefs, setShowPrefs] = useState(false);
  const [capitalInput, setCapitalInput] = useState(String(DEFAULT_TRADING_PREFS.capitalRp));
  const [riskInput, setRiskInput] = useState(String(DEFAULT_TRADING_PREFS.riskPerTradePct));
  const [maxPosInput, setMaxPosInput] = useState(String(DEFAULT_TRADING_PREFS.maxPositions));
  const [prefsSavedToast, setPrefsSavedToast] = useState(false);

  // Modal Morning Action Sheet
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [copiedSheet, setCopiedSheet] = useState(false);

  // Form tambah posisi
  const [showAdd, setShowAdd] = useState(false);
  const [tickerInput, setTickerInput] = useState("");
  const [buyDate, setBuyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [buyPrice, setBuyPrice] = useState("");
  const [lots, setLots] = useState("");
  const [slInstalled, setSlInstalled] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Konfirmasi hapus inline (anti popup-blocker mobile)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modal tutup posisi (catat jual)
  const [closingPos, setClosingPos] = useState<EnrichedPosition | null>(null);
  const [sellDate, setSellDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sellPrice, setSellPrice] = useState("");
  const [exitReason, setExitReason] = useState<ExitReason>("AUTO_SL");

  useEffect(() => {
    const loaded = loadTradingPrefs();
    setPrefs(loaded);
    setCapitalInput(String(loaded.capitalRp));
    setRiskInput(String(loaded.riskPerTradePct));
    setMaxPosInput(String(loaded.maxPositions));
  }, []);

  function handleSavePrefs(e: React.FormEvent) {
    e.preventDefault();
    const cap = Number(capitalInput.replace(/\./g, "").replace(",", "."));
    const rsk = Number(riskInput.replace(",", "."));
    const mx = parseInt(maxPosInput, 10);

    const next: TradingPrefs = {
      capitalRp: Number.isFinite(cap) && cap > 0 ? cap : prefs.capitalRp,
      riskPerTradePct: Number.isFinite(rsk) && rsk > 0 && rsk <= 10 ? rsk : prefs.riskPerTradePct,
      maxPositions: Number.isInteger(mx) && mx >= 1 && mx <= 20 ? mx : prefs.maxPositions,
    };
    saveTradingPrefs(next);
    setPrefs(next);
    setCapitalInput(String(next.capitalRp));
    setRiskInput(String(next.riskPerTradePct));
    setMaxPosInput(String(next.maxPositions));
    setPrefsSavedToast(true);
    setTimeout(() => setPrefsSavedToast(false), 2000);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const db = supabaseBrowser();
      const [posRes, rawScreener] = await Promise.all([
        db
          .from("portfolio_positions")
          .select("*")
          .order("status", { ascending: false })
          .order("buy_date", { ascending: false }),
        fetchAll<any>((from, to) => db.from("screener_latest").select("*").range(from, to)),
      ]);

      if (posRes.error) throw new Error(posRes.error.message);

      const list: PositionRow[] = (posRes.data ?? []).map((d: any) => ({
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
        exit_reason: (d.exit_reason as ExitReason | null) ?? null,
      }));
      setPositions(list);

      // Rezim IHSG & kandidat Top Pick dari screener_latest untuk Morning Action Sheet
      const idxRow = rawScreener.find((d) => d.ticker === INDEX_TICKER);
      if (idxRow && idxRow.trend !== null && idxRow.trend !== undefined) {
        setIhsgBullish(Number(idxRow.trend) === 1);
      }

      const stocksOnly = rawScreener.filter((d) => d.ticker !== INDEX_TICKER);
      const latest = stocksOnly.reduce((mx, d) => (d.date > mx ? d.date : mx), "");
      setLatestMarketDate(latest);

      const metrics = stocksOnly.map((d) => metricsFromDb(d));
      const pm = percentileMap(
        stocksOnly.map((d, i) => ({
          key: d.ticker,
          value: d.date === latest ? metrics[i]?.ret60 ?? null : null,
        }))
      );

      const allScores: Record<string, number> = {};
      const picks: {
        ticker: string;
        score: number;
        close: number;
        slTickPrice: number;
        maxBuyPrice: number;
      }[] = [];

      stocksOnly.forEach((d, i) => {
        const m = metrics[i];
        const stale = d.date < latest;
        if (!m || stale || Number(d.volume) <= 0 || Number(d.trend) !== 1) return;
        const rsVal = pm.get(d.ticker) ?? null;
        const res = scoreMetrics(m, rsVal, MIN_AVG_VALUE);
        if (!res || !res.eligible) return;

        allScores[d.ticker] = res.total;

        if (m.avgValue20 < MIN_AVG_VALUE || res.total < 86) return;

        const close = Number(d.close);
        const stLine = m.stLine ?? (d.line !== null && d.line !== undefined ? Number(d.line) : null);
        if (stLine === null) return;
        const slTickPrice = floorToIdxTick(stLine, 1);
        const slRiskPct = close > 0 ? ((slTickPrice - close) / close) * 100 : null;
        if (slRiskPct !== null && slRiskPct < -8) return;

        picks.push({
          ticker: d.ticker,
          score: res.total,
          close,
          slTickPrice,
          maxBuyPrice: floorToIdxTick(close * 1.015, 0),
        });
      });

      picks.sort((a, b) => b.score - a.score);
      setScoreByTicker(allScores);
      setScreenerTopPicks(picks);

      // Ambil histori candlestick untuk seluruh ticker posisi OPEN
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
    const openOnly = positions.filter((p) => p.status === "OPEN");
    return openOnly
      .map((pos) => {
        const bars = barsMap[pos.ticker] ?? [];
        const st = bars.length >= ST_PERIOD ? supertrend(bars, ST_PERIOD, ST_MULT) : [];
        const sameTickerPositions = openOnly.filter((x) => x.ticker === pos.ticker);
        const currentSetupScore =
          scoreByTicker[pos.ticker] !== undefined ? scoreByTicker[pos.ticker] : null;
        const advice = evaluatePosition(pos, bars, st, {
          ihsgBullish,
          prefs,
          sameTickerPositions,
          currentSetupScore,
        });
        return { pos, advice };
      })
      .sort((a, b) => (a.advice?.healthScore ?? 50) - (b.advice?.healthScore ?? 50));
  }, [positions, barsMap, ihsgBullish, prefs, scoreByTicker]);

  const openTickerSet = useMemo(
    () => new Set(enrichedOpen.map((x) => x.pos.ticker)),
    [enrichedOpen]
  );

  // Kandidat antrean beli besok pagi (yang belum dipegang) untuk Morning Action Sheet
  const morningBuyCandidates: MorningBuyCandidate[] = useMemo(() => {
    return screenerTopPicks
      .filter((p) => !openTickerSet.has(p.ticker))
      .map((p) => {
        const sizing = computePositionSizing({
          entryPrice: p.close,
          stopLossPrice: p.slTickPrice,
          prefs,
          ihsgBullish,
        });
        return {
          ticker: p.ticker,
          score: p.score,
          close: p.close,
          maxBuyLimit: p.maxBuyPrice,
          orderSl: p.slTickPrice,
          lots: sizing.lots,
          estimatedCostRp: sizing.estimatedCostRp,
        };
      })
      .filter((c) => c.lots > 0);
  }, [screenerTopPicks, openTickerSet, prefs, ihsgBullish]);

  const actionSheetText = useMemo(() => {
    return buildMorningActionText({
      dateLabel: latestMarketDate ? fmtDate(latestMarketDate) : undefined,
      ihsgBullish,
      openAdvices: enrichedOpen,
      buyCandidates: morningBuyCandidates,
      maxPositions: prefs.maxPositions,
    });
  }, [latestMarketDate, ihsgBullish, enrichedOpen, morningBuyCandidates, prefs.maxPositions]);

  async function copyActionSheet() {
    try {
      await navigator.clipboard.writeText(actionSheetText);
      setCopiedSheet(true);
      setTimeout(() => setCopiedSheet(false), 2500);
    } catch {
      /* abaikan */
    }
  }

  // Kalkulasi bantuan Position Sizing langsung saat user mengetik Harga Beli & SL di form Tambah Posisi
  const addFormSizingHint = useMemo(() => {
    const pNum = Number(buyPrice.replace(/\./g, "").replace(",", "."));
    const sNum = Number(slInstalled.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(pNum) || pNum <= 0 || !Number.isFinite(sNum) || sNum <= 0 || sNum >= pNum) {
      return null;
    }
    return computePositionSizing({
      entryPrice: pNum,
      stopLossPrice: floorToIdxTick(sNum, 0),
      prefs,
      ihsgBullish,
    });
  }, [buyPrice, slInstalled, prefs, ihsgBullish]);

  const closedList = useMemo(() => positions.filter((p) => p.status === "CLOSED"), [positions]);
  const perfStats = useMemo(() => computePerformanceStats(closedList), [closedList]);

  const totals = useMemo(() => {
    let modal = 0;
    let nilai = 0;
    let actionNeeded = 0;
    let totalLockedOrRiskRp = 0;
    let unguardedCount = 0;

    for (const item of enrichedOpen) {
      const m = item.pos.buy_price * item.pos.lots * 100;
      modal += m;
      nilai += item.advice ? item.advice.marketValue : m;
      if (item.advice && item.advice.code !== "HOLD" && item.advice.code !== "FRESH_ENTRY_MONITOR") {
        actionNeeded++;
      }
      if (item.pos.sl_installed === null) {
        unguardedCount++;
      }
      if (item.advice && item.advice.lockedPnlRp !== null) {
        totalLockedOrRiskRp += item.advice.lockedPnlRp;
      }
    }
    const pnl = nilai - modal;
    const pnlPct = modal > 0 ? (pnl / modal) * 100 : 0;
    return { modal, nilai, pnl, pnlPct, actionNeeded, totalLockedOrRiskRp, unguardedCount };
  }, [enrichedOpen]);

  // Preview Realized P/L pada modal tutup posisi
  const closePreview = useMemo(() => {
    if (!closingPos) return null;
    const sPrice = Number(sellPrice.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(sPrice) || sPrice <= 0) return null;
    const pnlRp = (sPrice - closingPos.pos.buy_price) * closingPos.pos.lots * 100;
    const pnlPct = ((sPrice - closingPos.pos.buy_price) / closingPos.pos.buy_price) * 100;
    return { pnlRp, pnlPct };
  }, [closingPos, sellPrice]);

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
      const rawSlNum = slInstalled.trim() ? Number(slInstalled.replace(/\./g, "").replace(",", ".")) : null;

      if (!Number.isFinite(priceNum) || priceNum <= 0) throw new Error("Harga beli tidak valid.");
      if (!Number.isFinite(lotsNum) || lotsNum <= 0) throw new Error("Jumlah lot tidak valid.");
      if (rawSlNum !== null && (!Number.isFinite(rawSlNum) || rawSlNum <= 0)) {
        throw new Error("Harga SL terpasang tidak valid.");
      }

      const slNum = rawSlNum !== null ? floorToIdxTick(rawSlNum, 0) : null;

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
    setErr(null);
    try {
      const sPrice = Number(sellPrice.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(sPrice) || sPrice <= 0) throw new Error("Harga jual tidak valid.");
      if (sellDate < closingPos.pos.buy_date) {
        throw new Error(`Tanggal jual tidak boleh lebih awal dari tanggal beli (${fmtDate(closingPos.pos.buy_date)}).`);
      }

      const db = supabaseBrowser();
      const { error } = await db
        .from("portfolio_positions")
        .update({
          status: "CLOSED",
          sell_date: sellDate,
          sell_price: sPrice,
          exit_reason: exitReason,
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
    try {
      const db = supabaseBrowser();
      const { error } = await db.from("portfolio_positions").delete().eq("id", posId);
      if (error) throw new Error(error.message);
      setConfirmDeleteId(null);
      await loadData();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  const freeSlots = Math.max(0, prefs.maxPositions - openTickerSet.size);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
              ← Screener
            </Link>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">Portofolio & Aksi Besok</h1>
            {ihsgBullish !== null && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  ihsgBullish ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                }`}
              >
                {ihsgBullish ? "IHSG Bullish · Porsi 100%" : "IHSG Bearish · Porsi 50%"}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 md:text-sm">
            Evaluasi otomatis posisi terbuka (Supertrend ATR {ST_PERIOD}, mult {ST_MULT}) · Slot aktif{" "}
            <b>
              {openTickerSet.size}/{prefs.maxPositions}
            </b>{" "}
            ({freeSlots > 0 ? `sisa ${freeSlots} slot` : "penuh"}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowPrefs((v) => !v)}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Atur Modal & Risiko
          </button>
          <button
            onClick={() => setShowActionSheet(true)}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Morning Action Sheet
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {showAdd ? "Tutup Form" : "+ Catat Beli Baru"}
          </button>
        </div>
      </div>

      {/* Panel Pengaturan Modal, Risiko & Slot */}
      {showPrefs && (
        <form
          onSubmit={handleSavePrefs}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Pengaturan Modal & Manajemen Risiko</h2>
              <p className="text-xs text-slate-500">
                Digunakan untuk menghitung saran jumlah lot, batas risiko maksimal per posisi, dan alokasi slot.
              </p>
            </div>
            {prefsSavedToast && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                ✓ Tersimpan
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Total Modal Trading (Rp)</span>
              <input
                required
                inputMode="numeric"
                value={capitalInput}
                onChange={(e) => setCapitalInput(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Maks Risiko / Trade (%)</span>
              <input
                required
                inputMode="decimal"
                value={riskInput}
                onChange={(e) => setRiskInput(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Maks Slot Saham Aktif</span>
              <input
                required
                inputMode="numeric"
                value={maxPosInput}
                onChange={(e) => setMaxPosInput(e.target.value)}
                className={inputCls}
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Simpan Pengaturan
              </button>
            </div>
          </div>
        </form>
      )}

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-800">Catat Transaksi Beli Baru</h2>
            {tickerInput.trim() && openTickerSet.has(
              tickerInput.trim().toUpperCase().endsWith(".JK")
                ? tickerInput.trim().toUpperCase()
                : `${tickerInput.trim().toUpperCase()}.JK`
            ) && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                Catatan: Saham ini sudah ada di portofolio (Pastikan statusnya SIAP ADD-ON)
              </span>
            )}
          </div>

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

          {/* Saran Lot Ideal Otomatis berdasarkan Harga Beli & SL Terpasang */}
          {addFormSizingHint && addFormSizingHint.lots > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50/80 px-3.5 py-2 text-xs text-emerald-900">
              <span>
                Saran Position Sizing ({ihsgBullish === false ? "IHSG Bearish 50%" : "IHSG Bullish 100%"}):{" "}
                <b>{addFormSizingHint.lots} Lot</b> (~Rp {fmtInt.format(addFormSizingHint.estimatedCostRp)} · Risiko SL Rp{" "}
                {fmtInt.format(addFormSizingHint.actualRiskRp)})
              </span>
              <button
                type="button"
                onClick={() => setLots(String(addFormSizingHint.lots))}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700"
              >
                Pakai {addFormSizingHint.lots} Lot
              </button>
            </div>
          )}

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
          <div className="text-xs font-medium text-slate-500">Modal Aktif ({enrichedOpen.length} posisi)</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-slate-900 md:text-xl">
            Rp {fmtInt.format(totals.modal)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            Alokasi {prefs.capitalRp > 0 ? fmtDec.format((totals.modal / prefs.capitalRp) * 100) : 0}% dari modal
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Nilai Pasar Saat Ini</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-slate-900 md:text-xl">
            Rp {fmtInt.format(totals.nilai)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {totals.totalLockedOrRiskRp >= 0 ? (
              <span className="text-emerald-600">
                Terkunci di SL: +Rp {fmtInt.format(totals.totalLockedOrRiskRp)}
              </span>
            ) : (
              <span className="text-slate-500">
                Risiko SL aktif: Rp {fmtInt.format(totals.totalLockedOrRiskRp)}
              </span>
            )}
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
          {totals.unguardedCount > 0 && (
            <div className="mt-0.5 text-[11px] font-medium text-rose-600">
              {totals.unguardedCount} posisi belum catat SL
            </div>
          )}
        </div>
      </div>

      {/* Panel Statistik Performa Nyata (Realized Win Rate, Expectancy & Penambahan Portofolio Bersih) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Statistik Performa (Realized)</h2>
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
            const setupScore = advice?.currentSetupScore ?? null;
            const scoreBadgeCls =
              setupScore === null
                ? ""
                : setupScore >= 86
                ? "bg-emerald-600 text-white"
                : setupScore >= 71
                ? "bg-emerald-100 text-emerald-800"
                : setupScore >= 57
                ? "bg-amber-100 text-amber-800"
                : "bg-rose-100 text-rose-800";

            return (
              <div
                key={pos.id}
                className={`overflow-hidden rounded-2xl border-2 p-4 shadow-sm transition-all md:p-5 ${
                  advice ? `${advice.borderCls} ${advice.cardTintCls}` : "border-slate-200 bg-white"
                }`}
              >
                {/* Baris Atas: Ticker + Skor Screener + Badge Keputusan Besok */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/stock/${encodeURIComponent(pos.ticker)}`}
                        className="text-xl font-bold tracking-tight text-slate-900 hover:text-emerald-700"
                      >
                        {cleanTicker}
                      </Link>
                      {setupScore !== null && (
                        <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${scoreBadgeCls}`}>
                          Skor Screener: {setupScore}
                        </span>
                      )}
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
                              <b className="text-slate-700">{r.label}:</b> {r.detail}
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

                    {/* Metrik Posisi (6 Kolom Lengkap) */}
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200/80 pt-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
                      <div>
                        <span className="text-slate-500">Harga Terakhir</span>
                        <div className="mt-0.5 font-bold tabular-nums text-slate-800">
                          Rp {fmtInt.format(advice.currentPrice)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Impas net: Rp {fmtInt.format(advice.netBreakevenPrice)}
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
                          {fmtDec.format(advice.pnlPct)}%
                        </div>
                        <div className="text-[10px] tabular-nums text-slate-500">
                          {advice.pnlRp >= 0 ? "+" : ""}Rp {fmtInt.format(advice.pnlRp)}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">SL Terpasang</span>
                        <div
                          className={`mt-0.5 font-bold tabular-nums ${
                            pos.sl_installed ? "text-slate-800" : "text-rose-600"
                          }`}
                        >
                          {pos.sl_installed ? `Rp ${fmtInt.format(pos.sl_installed)}` : "Belum dicatat"}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Acuan SL Baru (ST)</span>
                        <div className="mt-0.5 font-bold tabular-nums text-rose-600">
                          {advice.suggestedSl ? `Rp ${fmtInt.format(advice.suggestedSl)}` : "–"}
                        </div>
                        {advice.suggestedSl && (
                          <div className="text-[10px] tabular-nums text-slate-400">
                            {fmtDec.format(advice.slRiskFromCurrentPct)}% dari close
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-500">
                          {advice.lockedPnlRp !== null && advice.lockedPnlRp >= 0
                            ? "Profit Terkunci (SL)"
                            : "Batas Risiko (SL)"}
                        </span>
                        {advice.lockedPnlRp !== null && advice.lockedPnlPct !== null ? (
                          <>
                            <div
                              className={`mt-0.5 font-bold tabular-nums ${
                                advice.lockedPnlRp >= 0 ? "text-emerald-600" : "text-amber-700"
                              }`}
                            >
                              {advice.lockedPnlPct >= 0 ? "+" : ""}
                              {fmtDec.format(advice.lockedPnlPct)}%
                            </div>
                            <div className="text-[10px] tabular-nums text-slate-500">
                              {advice.lockedPnlRp >= 0 ? "+" : ""}Rp {fmtInt.format(advice.lockedPnlRp)}
                            </div>
                          </>
                        ) : (
                          <div className="mt-0.5 font-bold text-slate-400">–</div>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-500">Usia Pegang</span>
                        <div className="mt-0.5 font-bold tabular-nums text-slate-800">
                          {advice.holdingBars} hari bursa
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {advice.daysToTimeStop > 0
                            ? `Sisa ${advice.daysToTimeStop}h ke eval 20h`
                            : "Lewat horizon 20h"}
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

                    {/* Tombol Pintasan Catat Add-On jika posisi sudah memenuhi syarat SIAP ADD-ON */}
                    {advice && advice.addOnReady && advice.addOnSuggestedLots > 0 && (
                      <button
                        onClick={() => {
                          setTickerInput(cleanTicker);
                          setBuyDate(new Date().toISOString().slice(0, 10));
                          setBuyPrice(String(floorToIdxTick(advice.currentPrice)));
                          setLots(String(advice.addOnSuggestedLots));
                          setSlInstalled(advice.suggestedSl ? String(advice.suggestedSl) : "");
                          setNotes("Add-on (posisi awal sudah zero risk)");
                          setShowAdd(true);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                      >
                        + Catat Add-On ({advice.addOnSuggestedLots} Lot)
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setClosingPos({ pos, advice });
                        setSellDate(new Date().toISOString().slice(0, 10));
                        setSellPrice(
                          advice
                            ? String(floorToIdxTick(advice.currentPrice))
                            : String(pos.buy_price)
                        );
                        setExitReason(
                          advice?.code === "EXIT_STOP"
                            ? "SIGNAL_EXIT"
                            : advice?.code === "TIME_STOP"
                            ? "TIME_STOP"
                            : advice?.code === "EXTENDED_PROFIT" || advice?.code === "PARABOLIC_SPIKE"
                            ? "TAKE_PROFIT"
                            : "AUTO_SL"
                        );
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Catat Jual / Tutup Posisi
                    </button>
                  </div>

                  {confirmDeleteId === pos.id ? (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        onClick={() => handleDelete(pos.id)}
                        className="font-semibold text-rose-600 hover:underline"
                      >
                        Yakin Hapus?
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(pos.id)}
                      className="text-xs text-slate-400 hover:text-rose-600"
                    >
                      Hapus
                    </button>
                  )}
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
                  <th className="px-3 py-2">Alasan Keluar</th>
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
                      <td className="px-3 py-2 text-slate-500">
                        {c.exit_reason ? (EXIT_REASON_LABELS[c.exit_reason] ?? c.exit_reason) : "–"}
                      </td>
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
                  min={closingPos.pos.buy_date}
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

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Alasan Keluar</span>
              <select
                value={exitReason}
                onChange={(e) => setExitReason(e.target.value as ExitReason)}
                className={inputCls}
              >
                {EXIT_REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            {closePreview && (
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs">
                <span className="text-slate-600">Estimasi Realized P/L:</span>
                <span
                  className={`font-bold tabular-nums ${
                    closePreview.pnlRp >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {closePreview.pnlRp >= 0 ? "+" : ""}
                  Rp {fmtInt.format(closePreview.pnlRp)} ({closePreview.pnlPct >= 0 ? "+" : ""}
                  {fmtDec.format(closePreview.pnlPct)}%)
                </span>
              </div>
            )}

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

      {/* Modal Morning Action Sheet */}
      {showActionSheet && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setShowActionSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Morning Action Sheet · Rencana Besok Pagi</h3>
                <p className="text-xs text-slate-500">
                  Prioritas Jual/Exit, Update Trailing SL, dan Antrean Beli Top Pick sesuai sisa slot ({freeSlots}/
                  {prefs.maxPositions}).
                </p>
              </div>
              <button
                onClick={() => setShowActionSheet(false)}
                className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
              {actionSheetText}
            </pre>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowActionSheet(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Tutup
              </button>
              <button
                onClick={copyActionSheet}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                {copiedSheet ? "✓ Tersalin ke Clipboard!" : "Salin Semua Order Besok"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";
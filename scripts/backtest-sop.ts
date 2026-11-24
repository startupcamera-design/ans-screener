// Simulasi Portofolio Realistis (SOP Runner) ANS Screener
// Menguji alur eksekusi harian penuh: Antrean Limit +1.5%, Anti-FOMO, Auto-SL Intraday,
// Trailing SL, TP Bertahap 50%, Time-Stop 20 bar, serta perbandingan 8 mode Stop Loss (SL-0 s/d SL-7).
//
// Pakai:
//   npx tsx scripts/backtest-sop.ts ./data-csv [--sl-mode eod_hybrid|atr_chandelier|early_be6|ratchet_lock|two_day_flip] [--dump]

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { checkHeaders, dedupe, validateRow, type PriceRow } from "../src/lib/csv";
import { supertrend } from "../src/lib/supertrend";
import { computeMetrics, type Metrics, type VBar } from "../src/lib/metrics";
import { percentileMap, scoreMetrics } from "../src/lib/scoring";
import { INDEX_TICKER, MIN_AVG_VALUE, ST_MULT, ST_PERIOD } from "../src/lib/config";

/* ---------------- argumen ---------------- */
const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: "backtest-sop-out" },
    capital: { type: "string", default: "1000000000" }, // Rp 1 Miliar
    alloc: { type: "string", default: "40000000" }, // Default Skenario A: Rp 40 Juta per saham
    "max-pos": { type: "string", default: "25" }, // Default Skenario A: Maks 25 posisi aktif
    "sl-mode": { type: "string", default: "eod_hybrid" },
    "min-value": { type: "string", default: String(MIN_AVG_VALUE) },
    "fee-buy": { type: "string", default: "0.0015" }, // 0.15%
    "fee-sell": { type: "string", default: "0.0025" }, // 0.25%
    warmup: { type: "string", default: "100" },
    dump: { type: "boolean", default: false },
  },
});

if (positionals.length === 0) {
  console.error(
    "Pakai: npx tsx scripts/backtest-sop.ts <folder-atau-file.csv> [--capital 1000000000] [--alloc 40000000] [--max-pos 25] [--sl-mode eod_hybrid] [--dump]"
  );
  process.exit(1);
}

const INITIAL_CAPITAL = Number(opt.capital);
const BASE_ALLOC = Number(opt.alloc);
const MAX_POSITIONS = Math.max(1, Math.floor(Number(opt["max-pos"])));
const SL_MODE = String(opt["sl-mode"]);
const MIN_VALUE = Number(opt["min-value"]);
const FEE_BUY = Number(opt["fee-buy"]);
const FEE_SELL = Number(opt["fee-sell"]);
const WARMUP = Math.max(70, Math.floor(Number(opt.warmup)));

const SL_MODE_LABELS: Record<string, string> = {
  baseline: "SL-0: Baseline (Supertrend - 1 tick)",
  buf1: "SL-1: Buffer ST -1.0% (Max Risk ~8.5%)",
  buf15: "SL-2: Buffer ST -1.5% (Max Risk ~9.0%)",
  eod_hybrid: "SL-3: Hybrid (Hard -8% + BE +10% + EOD Flip)",
  atr_chandelier: "SL-4: Chandelier ATR (2.5x Entry / 3.0x High)",
  early_be6: "SL-5: Hybrid + Early Breakeven (+6%)",
  ratchet_lock: "SL-6: Hybrid + Ratchet Lock (+6%/+12%/+20%)",
  two_day_flip: "SL-7: Hybrid + 2-Day Bearish Flip Confirm",
};

/* ---------------- helper fraksi harga BEI & kalkulator SL ---------------- */
function idxTickSize(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

function floorToIdxTick(price: number, extraTicks = 0): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const tick = idxTickSize(price);
  const base = Math.floor(price / tick) * tick;
  return Math.max(tick, base - extraTicks * tick);
}

function calcAutoSl(stLine: number, refPrice: number, mode: string, atrVal = 0): number {
  if (mode === "buf1") {
    const raw = floorToIdxTick(stLine * 0.99, 1);
    const floorCap = floorToIdxTick(refPrice * 0.915, 0);
    return Math.max(raw, floorCap);
  }
  if (mode === "buf15") {
    const raw = floorToIdxTick(stLine * 0.985, 1);
    const floorCap = floorToIdxTick(refPrice * 0.91, 0);
    return Math.max(raw, floorCap);
  }
  if (mode === "atr_chandelier") {
    const atrStop = atrVal > 0 ? refPrice - 2.5 * atrVal : refPrice * 0.92;
    const floorCap = refPrice * 0.92; // tetap dibatasi maks -8%
    return floorToIdxTick(Math.max(atrStop, floorCap), 0);
  }
  if (mode === "eod_hybrid" || mode === "early_be6" || mode === "ratchet_lock" || mode === "two_day_flip") {
    return floorToIdxTick(refPrice * 0.92, 0);
  }
  return floorToIdxTick(stLine, 1);
}

/* ---------------- baca CSV ---------------- */
function listCsv(p: string): string[] {
  const s = statSync(p);
  if (s.isFile()) return [p];
  return readdirSync(p)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort()
    .map((f) => join(p, f));
}

const files = positionals.flatMap((p) => listCsv(resolve(p)));
if (files.length === 0) {
  console.error("Tidak ada file .csv ditemukan.");
  process.exit(1);
}

const all: PriceRow[] = [];
for (const f of files) {
  const lines = readFileSync(f, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  const head = (lines[0] ?? "").split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  if (checkHeaders(head)) continue;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const rec: Record<string, string> = {};
    head.forEach((h, k) => (rec[h] = cells[k]));
    const r = validateRow(rec);
    if (r.status === "ok") all.push(r.row);
  }
}
const uniq = dedupe(all);
console.error(`Membaca ${files.length} file: ${uniq.length} baris unik | Mode SL: ${SL_MODE}`);

type BarWithInd = VBar & {
  idx: number;
  trend: 1 | -1 | null;
  stLine: number | null;
  metrics: Metrics | null;
  score: number | null;
  eligible: boolean;
  slTickPrice: number | null;
  slRiskPct: number | null;
};

const series = new Map<string, BarWithInd[]>();
for (const r of uniq) {
  const arr = series.get(r.ticker) ?? [];
  arr.push({
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    idx: 0,
    trend: null,
    stLine: null,
    metrics: null,
    score: null,
    eligible: false,
    slTickPrice: null,
    slRiskPct: null,
  });
  series.set(r.ticker, arr);
}
for (const arr of series.values()) {
  arr.sort((a, b) => a.date.localeCompare(b.date));
  arr.forEach((b, i) => (b.idx = i));
}

/* ---------------- hitung indikator & skor EOD ---------------- */
const regimeByDate = new Map<string, 1 | -1>();
const idxBars = series.get(INDEX_TICKER);
if (idxBars && idxBars.length >= 30) {
  const ist = supertrend(idxBars, ST_PERIOD, ST_MULT);
  const off = idxBars.length - ist.length;
  for (let i = 0; i < ist.length; i++) {
    regimeByDate.set(idxBars[i + off].date, ist[i].trend);
  }
}

const ret60ByDate = new Map<string, { ticker: string; value: number }[]>();
for (const [ticker, bars] of series) {
  if (ticker === INDEX_TICKER || bars.length < WARMUP) continue;
  const st = supertrend(bars, ST_PERIOD, ST_MULT);
  const off = bars.length - st.length;

  for (let i = 60; i < bars.length; i++) {
    const base = bars[i - 60].close;
    if (base > 0) {
      const arr = ret60ByDate.get(bars[i].date) ?? [];
      arr.push({ ticker, value: bars[i].close / base - 1 });
      ret60ByDate.set(bars[i].date, arr);
    }
  }

  for (let i = Math.max(WARMUP, off); i < bars.length; i++) {
    const m = computeMetrics(bars, st, i);
    if (!m) continue;
    bars[i].metrics = m;
    bars[i].trend = m.trend;
    bars[i].stLine = m.stLine;

    if (m.trend === 1 && m.stLine !== null && m.stLine > 0) {
      const slTick = floorToIdxTick(m.stLine, 1);
      bars[i].slTickPrice = slTick;
      bars[i].slRiskPct = bars[i].close > 0 ? ((slTick - bars[i].close) / bars[i].close) * 100 : null;
    }
  }
}

const rsByDate = new Map<string, Map<string, number>>();
for (const [d, arr] of ret60ByDate) {
  rsByDate.set(d, percentileMap(arr.map((x) => ({ key: x.ticker, value: x.value }))));
}

const barByDateAndTicker = new Map<string, Map<string, BarWithInd>>();
const activeDatesSet = new Set<string>();

for (const [ticker, bars] of series) {
  if (ticker === INDEX_TICKER) continue;
  for (const b of bars) {
    if (b.metrics && b.trend === 1) {
      const rs = rsByDate.get(b.date)?.get(ticker) ?? null;
      const res = scoreMetrics(b.metrics, rs, MIN_VALUE);
      b.score = res.total;
      b.eligible = res.eligible;
    }

    if (b.metrics !== null) activeDatesSet.add(b.date);

    let m = barByDateAndTicker.get(b.date);
    if (!m) {
      m = new Map();
      barByDateAndTicker.set(b.date, m);
    }
    m.set(ticker, b);
  }
}

const simDates = [...activeDatesSet].sort();
if (simDates.length === 0) {
  console.error("Tidak ada hari bursa aktif setelah periode warmup.");
  process.exit(1);
}

/* ---------------- mesin simulasi harian SOP ---------------- */
type OpenPos = {
  ticker: string;
  buyDate: string;
  buyPrice: number;
  highestClose: number;
  belowStStreak: number;
  initialLots: number;
  remainingLots: number;
  totalBuyCostRp: number; // termasuk fee beli
  realizedNetRp: number; // dari TP parsial 50% jika terjadi
  activeSl: number;
  partialTpDone: boolean;
  holdingBars: number;
  entryScore: number;
  ihsgBullishAtEntry: boolean;
};

type PendingBuy = {
  ticker: string;
  score: number;
  maxBuyLimit: number;
  rawStLine: number;
  entryAtr: number;
  targetAllocRp: number;
  ihsgBullish: boolean;
};

type PendingExit = {
  ticker: string;
  reason: "BEARISH_FLIP" | "TIME_STOP";
};

type ClosedTrade = {
  ticker: string;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  avgExitPrice: number;
  lots: number;
  holdingBars: number;
  entryScore: number;
  ihsgBullish: boolean;
  partialTpUsed: boolean;
  exitReason: string;
  investedRp: number;
  netPnlRp: number;
  netPnlPct: number;
};

let cash = INITIAL_CAPITAL;
const openPositions = new Map<string, OpenPos>();
let pendingBuys: PendingBuy[] = [];
let pendingExits: PendingExit[] = [];

const closedTrades: ClosedTrade[] = [];
const dailyCurve: {
  date: string;
  cash: number;
  holdingsValue: number;
  equity: number;
  openCount: number;
  drawdownPct: number;
}[] = [];

let peakEquity = INITIAL_CAPITAL;
let maxDrawdownPct = 0;
let skippedGapUpCount = 0;
let skippedNoCashCount = 0;

function closeEntirePosition(pos: OpenPos, exitPrice: number, sellDate: string, reason: string) {
  const grossSell = pos.remainingLots * 100 * exitPrice;
  const netSell = grossSell * (1 - FEE_SELL);
  cash += netSell;

  const totalNetProceeds = pos.realizedNetRp + netSell;
  const netPnlRp = totalNetProceeds - pos.totalBuyCostRp;
  const netPnlPct = (netPnlRp / pos.totalBuyCostRp) * 100;
  const avgExitPrice = totalNetProceeds / (1 - FEE_SELL) / (pos.initialLots * 100);

  closedTrades.push({
    ticker: pos.ticker,
    buyDate: pos.buyDate,
    sellDate,
    buyPrice: pos.buyPrice,
    avgExitPrice,
    lots: pos.initialLots,
    holdingBars: pos.holdingBars,
    entryScore: pos.entryScore,
    ihsgBullish: pos.ihsgBullishAtEntry,
    partialTpUsed: pos.partialTpDone,
    exitReason: reason,
    investedRp: pos.totalBuyCostRp,
    netPnlRp,
    netPnlPct,
  });

  openPositions.delete(pos.ticker);
}

for (const today of simDates) {
  const todayMap = barByDateAndTicker.get(today) ?? new Map<string, BarWithInd>();

  // 1. PRIORITAS 1 (PAGI HARI): Eksekusi Jual Paksa (Bearish Flip / Time-Stop dari EOD kemarin)
  for (const ex of pendingExits) {
    const pos = openPositions.get(ex.ticker);
    const bar = todayMap.get(ex.ticker);
    if (!pos || !bar || bar.volume <= 0) continue;
    closeEntirePosition(pos, bar.open, today, ex.reason);
  }
  pendingExits = [];

  // 2. PRIORITAS 3 (PAGI HARI): Eksekusi Antrean Beli dengan Aturan Anti-FOMO (+1.5%)
  for (const order of pendingBuys) {
    if (openPositions.size >= MAX_POSITIONS) break;
    if (openPositions.has(order.ticker)) continue;
    const bar = todayMap.get(order.ticker);
    if (!bar || bar.volume <= 0) continue;

    // Aturan Anti-FOMO: batalkan jika open gap up melebihi Beli Maks (+1.5%)
    if (bar.open > order.maxBuyLimit) {
      skippedGapUpCount++;
      continue;
    }

    const execPrice = bar.open;
    const entryAutoSl = calcAutoSl(order.rawStLine, execPrice, SL_MODE, order.entryAtr);
    if (execPrice <= entryAutoSl) continue;

    const maxAffordableAlloc = Math.min(order.targetAllocRp, cash / (1 + FEE_BUY));
    const lots = Math.floor(maxAffordableAlloc / (execPrice * 100));
    if (lots < 1) {
      skippedNoCashCount++;
      continue;
    }

    const grossCost = lots * 100 * execPrice;
    const totalBuyCostRp = grossCost * (1 + FEE_BUY);
    cash -= totalBuyCostRp;

    openPositions.set(order.ticker, {
      ticker: order.ticker,
      buyDate: today,
      buyPrice: execPrice,
      highestClose: execPrice,
      belowStStreak: 0,
      initialLots: lots,
      remainingLots: lots,
      totalBuyCostRp,
      realizedNetRp: 0,
      activeSl: entryAutoSl,
      partialTpDone: false,
      holdingBars: 0,
      entryScore: order.score,
      ihsgBullishAtEntry: order.ihsgBullish,
    });
  }
  pendingBuys = [];

  // 3. INTRADAY & EOD: Cek Auto-SL Intraday, TP Bertahap 50%, Trailing SL, & Sinyal Keluar Besok
  for (const [ticker, pos] of [...openPositions.entries()]) {
    const bar = todayMap.get(ticker);
    if (!bar) continue;

    pos.holdingBars += 1;
    if (bar.close > pos.highestClose) pos.highestClose = bar.close;

    // 3a. Cek Auto-SL Intraday (jika low menyentuh/menembus activeSl)
    if (bar.volume > 0 && bar.low <= pos.activeSl) {
      const stopFill = Math.min(bar.open, pos.activeSl);
      closeEntirePosition(pos, stopFill, today, "AUTO_SL_INTRADAY");
      continue;
    }

    const tickerSeries = series.get(ticker)!;
    const prevBar = bar.idx > 0 ? tickerSeries[bar.idx - 1] : null;
    const dailyJumpPct = prevBar && prevBar.close > 0 ? ((bar.close - prevBar.close) / prevBar.close) * 100 : 0;
    const floatingPct = ((bar.close - pos.buyPrice) / pos.buyPrice) * 100;

    // 3b. Cek TP Bertahap 50% (Lonjakan harian >= +12% atau floating profit >= +15%)
    if (!pos.partialTpDone && pos.remainingLots >= 2 && (dailyJumpPct >= 12 || floatingPct >= 15)) {
      const sellLots = Math.floor(pos.remainingLots / 2);
      const netPartial = sellLots * 100 * bar.close * (1 - FEE_SELL);
      cash += netPartial;
      pos.realizedNetRp += netPartial;
      pos.remainingLots -= sellLots;
      pos.partialTpDone = true;

      // Geser SL sisa lot ke 1 tick di bawah Low 3 hari terakhir
      const startIdx = Math.max(0, bar.idx - 2);
      let low3 = Infinity;
      for (let k = startIdx; k <= bar.idx; k++) low3 = Math.min(low3, tickerSeries[k].low);
      const tightSl = floorToIdxTick(low3, 1);
      if (tightSl > pos.activeSl) pos.activeSl = tightSl;
    }

    // 3c. Evaluasi EOD untuk rencana besok pagi
    const rawBearishFlip = bar.trend === -1 || (bar.stLine !== null && bar.close < bar.stLine);
    pos.belowStStreak = rawBearishFlip ? pos.belowStStreak + 1 : 0;

    // Khusus two_day_flip: butuh 2 hari berturut-turut di bawah ST (kecuali rugi sudah <= -5%)
    const isBearishFlip =
      SL_MODE === "two_day_flip"
        ? pos.belowStStreak >= 2 || (rawBearishFlip && floatingPct <= -5.0)
        : rawBearishFlip;

    const isTimeStop = pos.holdingBars >= 20 && floatingPct < 4.0;

    if (isBearishFlip) {
      pendingExits.push({ ticker, reason: "BEARISH_FLIP" });
    } else if (isTimeStop) {
      pendingExits.push({ ticker, reason: "TIME_STOP" });
    } else if (bar.stLine !== null) {
      let candidateSl = pos.activeSl;

      if (SL_MODE === "baseline" || SL_MODE === "buf1" || SL_MODE === "buf15") {
        candidateSl = calcAutoSl(bar.stLine, pos.buyPrice, SL_MODE);
      } else if (SL_MODE === "eod_hybrid" || SL_MODE === "two_day_flip") {
        const beThresh = SL_MODE === "two_day_flip" ? 8 : 10;
        if (floatingPct >= beThresh) {
          candidateSl = Math.max(candidateSl, floorToIdxTick(pos.buyPrice * 1.005, 0));
        }
      } else if (SL_MODE === "early_be6") {
        if (floatingPct >= 6) {
          candidateSl = Math.max(candidateSl, floorToIdxTick(pos.buyPrice * 1.005, 0));
        }
      } else if (SL_MODE === "ratchet_lock") {
        if (floatingPct >= 20) {
          candidateSl = Math.max(candidateSl, floorToIdxTick(pos.buyPrice * 1.12, 0));
        } else if (floatingPct >= 12) {
          candidateSl = Math.max(candidateSl, floorToIdxTick(pos.buyPrice * 1.06, 0));
        } else if (floatingPct >= 6) {
          candidateSl = Math.max(candidateSl, floorToIdxTick(pos.buyPrice * 1.005, 0));
        }
      } else if (SL_MODE === "atr_chandelier") {
        const curAtr = bar.metrics ? (bar.metrics.atrPct / 100) * bar.close : 0;
        if (curAtr > 0) {
          const chandSl = floorToIdxTick(pos.highestClose - 3.0 * curAtr, 0);
          candidateSl = Math.max(candidateSl, chandSl);
        }
      }

      if (candidateSl > pos.activeSl) {
        pos.activeSl = candidateSl;
      }
    }
  }

  // 4. SCREENER EOD: Kumpulkan Kandidat Beli Besok Pagi sesuai 5 Filter Wajib SOP
  const ihsgTrend = regimeByDate.get(today) ?? 1;
  const ihsgBullish = ihsgTrend === 1;
  const targetAllocRp = ihsgBullish ? BASE_ALLOC : BASE_ALLOC * 0.5;

  const candidates: PendingBuy[] = [];
  for (const [ticker, bar] of todayMap) {
    if (openPositions.has(ticker)) continue;
    if (bar.volume <= 0 || !bar.eligible || bar.trend !== 1 || !bar.metrics || bar.stLine === null) continue;
    if ((bar.score ?? 0) < 86) continue;
    if (bar.slTickPrice === null || bar.slRiskPct === null || bar.slRiskPct < -8.0) continue;

    // Usia tren ideal 5 - 40 bar (hindari entry dini 1-4 bar dan tren terlalu tua > 40 bar)
    const barsInTrend = bar.metrics.barsInTrend;
    if (barsInTrend < 5 || barsInTrend > 40) continue;

    const entryAtr = (bar.metrics.atrPct / 100) * bar.close;

    candidates.push({
      ticker,
      score: bar.score!,
      maxBuyLimit: floorToIdxTick(bar.close * 1.015, 0),
      rawStLine: bar.stLine,
      entryAtr,
      targetAllocRp,
      ihsgBullish,
    });
  }

  // Urutkan dari skor tertinggi
  candidates.sort((a, b) => b.score - a.score);
  pendingBuys = candidates;

  // 5. Catat Kurva Ekuitas Harian (Mark-to-Market)
  let holdingsValue = 0;
  for (const [ticker, pos] of openPositions) {
    const bar = todayMap.get(ticker);
    const markPrice = bar ? bar.close : pos.buyPrice;
    holdingsValue += pos.remainingLots * 100 * markPrice;
  }
  const equity = cash + holdingsValue;
  if (equity > peakEquity) peakEquity = equity;
  const drawdownPct = peakEquity > 0 ? ((equity - peakEquity) / peakEquity) * 100 : 0;
  if (drawdownPct < maxDrawdownPct) maxDrawdownPct = drawdownPct;

  dailyCurve.push({
    date: today,
    cash,
    holdingsValue,
    equity,
    openCount: openPositions.size,
    drawdownPct,
  });
}

/* ---------------- ringkasan statistik & laporan ---------------- */
const finalEquity = dailyCurve.length ? dailyCurve[dailyCurve.length - 1].equity : INITIAL_CAPITAL;
const totalReturnPct = ((finalEquity - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
const totalNetProfitRp = finalEquity - INITIAL_CAPITAL;

const years = Math.max(0.1, simDates.length / 245);
const cagrPct = (Math.pow(finalEquity / INITIAL_CAPITAL, 1 / years) - 1) * 100;

const wins = closedTrades.filter((t) => t.netPnlRp > 0);
const losses = closedTrades.filter((t) => t.netPnlRp <= 0);
const winRatePct = closedTrades.length ? (wins.length / closedTrades.length) * 100 : 0;

const avgGainPct = wins.length ? wins.reduce((s, t) => s + t.netPnlPct, 0) / wins.length : 0;
const avgLossPct = losses.length ? losses.reduce((s, t) => s + t.netPnlPct, 0) / losses.length : 0;
const avgAllPct = closedTrades.length ? closedTrades.reduce((s, t) => s + t.netPnlPct, 0) / closedTrades.length : 0;

const maxGainTrade = closedTrades.reduce<ClosedTrade | null>(
  (best, t) => (!best || t.netPnlPct > best.netPnlPct ? t : best),
  null
);
const maxLossTrade = closedTrades.reduce<ClosedTrade | null>(
  (worst, t) => (!worst || t.netPnlPct < worst.netPnlPct ? t : worst),
  null
);

const grossWinRp = wins.reduce((s, t) => s + t.netPnlRp, 0);
const grossLossRp = Math.abs(losses.reduce((s, t) => s + t.netPnlRp, 0));
const profitFactor = grossLossRp > 0 ? grossWinRp / grossLossRp : Infinity;
const avgHoldBars = closedTrades.length
  ? closedTrades.reduce((s, t) => s + t.holdingBars, 0) / closedTrades.length
  : 0;
const maxConcurrentPos = dailyCurve.reduce((mx, d) => Math.max(mx, d.openCount), 0);

const byYear = new Map<string, { startEq: number; endEq: number; trades: number; wins: number; netRp: number }>();
for (let i = 0; i < dailyCurve.length; i++) {
  const d = dailyCurve[i];
  const yr = d.date.slice(0, 4);
  const prevEq = i === 0 ? INITIAL_CAPITAL : dailyCurve[i - 1].equity;
  const rec = byYear.get(yr) ?? { startEq: prevEq, endEq: d.equity, trades: 0, wins: 0, netRp: 0 };
  rec.endEq = d.equity;
  byYear.set(yr, rec);
}
for (const t of closedTrades) {
  const yr = t.sellDate.slice(0, 4);
  const rec = byYear.get(yr);
  if (rec) {
    rec.trades++;
    if (t.netPnlRp > 0) rec.wins++;
    rec.netRp += t.netPnlRp;
  }
}

const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

const report: string[] = [
  "# Hasil Simulasi Portofolio SOP ANS Screener",
  "",
  "## 1. Parameter Simulasi",
  `- **Mode Stop Loss:** **${SL_MODE_LABELS[SL_MODE] ?? SL_MODE}**`,
  `- **Periode Uji:** ${simDates[0]} s/d ${simDates[simDates.length - 1]} (${simDates.length} hari bursa)`,
  `- **Modal Awal:** ${fmtRp(INITIAL_CAPITAL)}`,
  `- **Alokasi per Saham:** ${fmtRp(BASE_ALLOC)} (IHSG Bullish) / ${fmtRp(BASE_ALLOC * 0.5)} (IHSG Bearish) · Maks posisi aktif: ${MAX_POSITIONS}`,
  `- **Aturan Entry:** Skor ≥ 86, Risiko SL ≤ -8,0%, Usia Tren 5–40 bar, Limit Beli Maks +1,5% (Anti-FOMO)`,
  `- **Aturan Exit & TP:** Auto-SL Intraday (${SL_MODE}), Trailing SL, TP Parsial 50% (+12% harian / +15% total), Time-Stop 20 bar (< +4%)`,
  `- **Biaya Transaksi:** Beli ${(FEE_BUY * 100).toFixed(2)}% + Jual ${(FEE_SELL * 100).toFixed(2)}%`,
  "",
  "## 2. Kinerja Pertumbuhan Modal",
  `- **Modal Awal:** ${fmtRp(INITIAL_CAPITAL)}`,
  `- **Modal Akhir:** **${fmtRp(finalEquity)}** (termasuk ${openPositions.size} posisi masih terbuka di akhir periode)`,
  `- **Total Pertumbuhan Modal:** **${fmtPct(totalReturnPct)}** (${fmtRp(totalNetProfitRp)})`,
  `- **Rata-rata Pertumbuhan Tahunan (CAGR):** **${fmtPct(cagrPct)} / tahun**`,
  `- **Max Drawdown Portofolio (dari puncak ekuitas):** **${maxDrawdownPct.toFixed(2)}%**`,
  `- **Puncak Posisi Terbuka Bersamaan:** ${maxConcurrentPos} saham (maks modal terpakai ~${fmtRp(maxConcurrentPos * BASE_ALLOC)})`,
  "",
  "## 3. Statistik Transaksi (Closed Trades)",
  `- **Total Transaksi Selesai:** ${closedTrades.length} transaksi (${wins.length} profit · ${losses.length} rugi)`,
  `- **Win Rate:** **${winRatePct.toFixed(2)}%**`,
  `- **Profit Factor:** **${Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞"}**`,
  `- **Rata-rata Gain saat Profit (Avg Win):** **${fmtPct(avgGainPct)}**`,
  `- **Rata-rata Loss saat Rugi (Avg Loss):** **${fmtPct(avgLossPct)}**`,
  `- **Rata-rata Return per Transaksi (Expectancy):** **${fmtPct(avgAllPct)}**`,
  `- **Maksimal Gain (1 Transaksi):** **${maxGainTrade ? `${fmtPct(maxGainTrade.netPnlPct)} (${maxGainTrade.ticker} · ${maxGainTrade.buyDate} → ${maxGainTrade.sellDate})` : "–"}**`,
  `- **Maksimal Loss (1 Transaksi):** **${maxLossTrade ? `${fmtPct(maxLossTrade.netPnlPct)} (${maxLossTrade.ticker} · ${maxLossTrade.buyDate} → ${maxLossTrade.sellDate})` : "–"}**`,
  `- **Rata-rata Lama Hold:** ${avgHoldBars.toFixed(1)} hari bursa`,
  `- **Order Dibatalkan Anti-FOMO (Gap Up > +1,5%):** ${skippedGapUpCount} kali`,
  `- **Order Terlewat karena Kas Tidak Cukup:** ${skippedNoCashCount} kali`,
  "",
  "## 4. Progres Pertumbuhan Modal per Tahun",
  "| Tahun | Saldo Awal Tahun | Saldo Akhir Tahun | Pertumbuhan | Transaksi Selesai | Win Rate | Net P&L Realized |",
  "|---|---:|---:|---:|---:|---:|---:|",
];

for (const [yr, y] of byYear) {
  const yrGrowth = ((y.endEq - y.startEq) / y.startEq) * 100;
  const yrWr = y.trades > 0 ? (y.wins / y.trades) * 100 : 0;
  report.push(
    `| ${yr} | ${fmtRp(y.startEq)} | ${fmtRp(y.endEq)} | **${fmtPct(yrGrowth)}** | ${y.trades} | ${yrWr.toFixed(1)}% | ${fmtRp(y.netRp)} |`
  );
}

const byReason = new Map<string, ClosedTrade[]>();
for (const t of closedTrades) {
  const arr = byReason.get(t.exitReason) ?? [];
  arr.push(t);
  byReason.set(t.exitReason, arr);
}
report.push(
  "",
  "## 5. Breakdown Berdasarkan Alasan Exit",
  "| Alasan Exit | Jumlah | Porsi | Rata-rata P&L % | Total P&L Rp |",
  "|---|---:|---:|---:|---:|"
);
for (const [reason, arr] of byReason) {
  const share = (arr.length / closedTrades.length) * 100;
  const avgR = arr.reduce((s, t) => s + t.netPnlPct, 0) / arr.length;
  const sumRp = arr.reduce((s, t) => s + t.netPnlRp, 0);
  report.push(`| ${reason} | ${arr.length} | ${share.toFixed(1)}% | ${fmtPct(avgR)} | ${fmtRp(sumRp)} |`);
}

const outDir = resolve(String(opt.out));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "sop-report.md"), report.join("\n") + "\n");

if (opt.dump) {
  const tradeLines = [
    "ticker,buy_date,sell_date,buy_price,avg_exit_price,lots,hold_bars,entry_score,ihsg_bullish,partial_tp,exit_reason,invested_rp,net_pnl_rp,net_pnl_pct",
    ...closedTrades.map((t) =>
      [
        t.ticker,
        t.buyDate,
        t.sellDate,
        t.buyPrice,
        t.avgExitPrice.toFixed(2),
        t.lots,
        t.holdingBars,
        t.entryScore,
        t.ihsgBullish ? 1 : 0,
        t.partialTpUsed ? 1 : 0,
        t.exitReason,
        t.investedRp.toFixed(0),
        t.netPnlRp.toFixed(0),
        t.netPnlPct.toFixed(2),
      ].join(",")
    ),
  ];
  writeFileSync(join(outDir, "sop-trades.csv"), tradeLines.join("\n") + "\n");

  const curveLines = [
    "date,cash,holdings_value,equity,open_positions,drawdown_pct",
    ...dailyCurve.map((d) =>
      [
        d.date,
        d.cash.toFixed(0),
        d.holdingsValue.toFixed(0),
        d.equity.toFixed(0),
        d.openCount,
        d.drawdownPct.toFixed(2),
      ].join(",")
    ),
  ];
  writeFileSync(join(outDir, "sop-equity-curve.csv"), curveLines.join("\n") + "\n");
}

console.log(report.join("\n"));
console.error(`\nLaporan simulasi SOP (${SL_MODE}) disimpan di ${join(outDir, "sop-report.md")}`);
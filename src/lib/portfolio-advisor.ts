import type { VBar } from "./metrics";
import type { STPoint } from "./supertrend";

/** Patokan Resmi Hasil Optimasi Backtest (Skenario A + SL-7) */
export const SOP_BENCHMARK_CONFIG = {
  strategyName: "SOP ANS Screener · Skenario A + SL-7 (2-Day Flip Confirm)",
  periodLabel: "2025-06-13 s/d 2026-11-23 (352 hari bursa)",
  initialCapitalRp: 1_000_000_000,
  maxPositions: 25,
  allocBullishRp: 40_000_000,
  allocBearishRp: 20_000_000,
  minEntryScore: 86,
  maxInitialSlRiskPct: -8.0,
  idealTrendAgeRange: [5, 40] as const,
  antiFomoMaxGapPct: 1.5,
  hardStopLossPct: -8.0,
  breakevenLockTriggerPct: 8.0,
  breakevenLockTargetPct: 0.5,
  bearishFlipConfirmDays: 2,
  bearishFlipImmediateLossPct: -5.0,
  partialTpDailyJumpPct: 12.0,
  partialTpFloatingPct: 15.0,
  timeStopBars: 20,
  timeStopMinProfitPct: 4.0,
  backtestMetrics: {
    cagrPct: 25.94,
    totalReturnPct: 39.29,
    maxDrawdownPct: -7.9,
    winRatePct: 37.38,
    profitFactor: 1.81,
    expectancyPct: 3.0,
    avgWinPct: 17.52,
    avgLossPct: -5.66,
  },
} as const;

export type ExitReason =
  | "AUTO_SL"
  | "SIGNAL_EXIT"
  | "TIME_STOP"
  | "TAKE_PROFIT"
  | "MANUAL";

export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  AUTO_SL: "Kena Auto-SL (-8% / BE Lock)",
  SIGNAL_EXIT: "Konfirmasi Exit Supertrend (2 Hari)",
  TIME_STOP: "Time-Stop (≥ 20 Hari Bursa)",
  TAKE_PROFIT: "Take Profit",
  MANUAL: "Jual Manual / Rotasi",
};

export const EXIT_REASON_OPTIONS: { value: ExitReason; label: string }[] = [
  { value: "AUTO_SL", label: EXIT_REASON_LABELS.AUTO_SL },
  { value: "SIGNAL_EXIT", label: EXIT_REASON_LABELS.SIGNAL_EXIT },
  { value: "TIME_STOP", label: EXIT_REASON_LABELS.TIME_STOP },
  { value: "TAKE_PROFIT", label: EXIT_REASON_LABELS.TAKE_PROFIT },
  { value: "MANUAL", label: EXIT_REASON_LABELS.MANUAL },
];

export type PositionRow = {
  id: string;
  ticker: string;
  buy_date: string;
  buy_price: number;
  lots: number;
  sl_installed: number | null;
  notes: string | null;
  status: "OPEN" | "CLOSED";
  sell_date: string | null;
  sell_price: number | null;
  exit_reason?: ExitReason | null;
};

export type ActionCode =
  | "EXIT_STOP"
  | "CHECK_INTRADAY_SL"
  | "BEARISH_FLIP_WARN"
  | "GAP_WARNING"
  | "RAISE_SL"
  | "SL_TOO_WIDE"
  | "PARABOLIC_SPIKE"
  | "EXTENDED_PROFIT"
  | "TIME_STOP"
  | "MATURE_TREND_PROFIT"
  | "PYRAMIDING_READY"
  | "WATCH_MOMENTUM"
  | "FRESH_ENTRY_MONITOR"
  | "HOLD";

export type HealthFactor = {
  label: string;
  delta: number; // positif = menambah skor, negatif = mengurangi skor, 0 = dasar/netral
  detail: string;
};

export type PositionAdvice = {
  code: ActionCode;
  badge: string;
  badgeCls: string;
  borderCls: string;
  cardTintCls: string;
  healthScore: number; // 0 (kritis/jual) s/d 100 (sangat sehat/aman)
  healthLabel: string;
  healthColorCls: string;
  healthReasons: HealthFactor[]; // rincian penyebab skor kesehatan
  headline: string;
  detail: string;
  suggestedSl: number | null;
  belowStStreak: number; // jumlah hari bursa berturut-turut tutup di bawah garis ST
  holdingBars: number;
  daysToTimeStop: number; // sisa hari bursa menuju evaluasi 20 hari (0 jika sudah >= 20)
  currentPrice: number;
  netBreakevenPrice: number; // harga jual minimal agar impas setelah fee ~0.40%
  stLine: number;
  pnlRp: number;
  pnlPct: number;
  marketValue: number;
  slRiskFromCurrentPct: number;
  lockedPnlRp: number | null; // estimasi P/L bersih jika SL aktif (terpasang/disarankan) tersentuh
  lockedPnlPct: number | null; // % P/L terkunci pada SL aktif terhadap harga beli
  isBreakevenOrBetter: boolean;
  currentSetupScore: number | null; // skor screener terbaru (0-100) jika tersedia
  addOnReady: boolean;
  addOnSuggestedLots: number;
};

/** Aturan fraksi harga saham reguler BEI */
export function getIdxTick(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

/** Bulatkan harga ke fraksi BEI sah terdekat ke bawah (dengan opsi kurangi N tick untuk buffer SL) */
export function floorToIdxTick(price: number, subtractTicks = 0): number {
  if (price <= 0) return 0;
  let p = price;
  for (let i = 0; i <= subtractTicks; i++) {
    const tick = getIdxTick(p);
    if (i === 0) {
      p = Math.floor(p / tick) * tick;
    } else {
      const prevTick = getIdxTick(p - 1);
      p = p - prevTick;
    }
  }
  return Math.max(1, p);
}

/** Bulatkan harga ke fraksi BEI sah terdekat ke atas (untuk harga impas / target) */
export function ceilToIdxTick(price: number): number {
  if (price <= 0) return 0;
  const tick = getIdxTick(price);
  return Math.ceil(price / tick) * tick;
}

/** Hitung harga Hard Auto-SL awal (-8% dari harga beli sesuai SL-7) */
export function calcHardSlPrice(buyPrice: number): number {
  return floorToIdxTick(buyPrice * (1 + SOP_BENCHMARK_CONFIG.hardStopLossPct / 100), 0);
}

/** Hitung harga Breakeven Lock (+0.5% di atas harga beli setelah profit >= +8%) */
export function calcBreakevenLockPrice(buyPrice: number): number {
  return ceilToIdxTick(buyPrice * (1 + SOP_BENCHMARK_CONFIG.breakevenLockTargetPct / 100));
}

/** Pengaturan Modal, Manajemen Risiko & Batas Slot Portofolio (disimpan di localStorage) */
export type TradingPrefs = {
  capitalRp: number; // Total modal trading (default Rp 1.000.000.000 - Skenario A)
  riskPerTradePct: number; // Maksimal risiko rugi per posisi dalam % modal (default 0.35% ~ 4% slot x 8% SL)
  maxPositions: number; // Maksimal jumlah saham aktif bersamaan (default 25 - Skenario A)
};

export const DEFAULT_TRADING_PREFS: TradingPrefs = {
  capitalRp: SOP_BENCHMARK_CONFIG.initialCapitalRp, // Rp 1.000.000.000
  riskPerTradePct: 0.4, // Mendukung alokasi penuh 1 slot (4% modal = Rp 40 jt) pada jarak SL -8%
  maxPositions: SOP_BENCHMARK_CONFIG.maxPositions, // 25 slot aktif
};

// Versi v2 agar pengguna otomatis mendapatkan patokan Skenario A (1 Miliar / 25 Slot)
const PREFS_STORAGE_KEY = "st_screener_trading_prefs_v2";

export function loadTradingPrefs(): TradingPrefs {
  if (typeof window === "undefined") return DEFAULT_TRADING_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_TRADING_PREFS;
    const parsed = JSON.parse(raw);
    return {
      capitalRp:
        Number.isFinite(Number(parsed.capitalRp)) && Number(parsed.capitalRp) > 0
          ? Number(parsed.capitalRp)
          : DEFAULT_TRADING_PREFS.capitalRp,
      riskPerTradePct:
        Number.isFinite(Number(parsed.riskPerTradePct)) &&
        Number(parsed.riskPerTradePct) > 0 &&
        Number(parsed.riskPerTradePct) <= 10
          ? Number(parsed.riskPerTradePct)
          : DEFAULT_TRADING_PREFS.riskPerTradePct,
      maxPositions:
        Number.isInteger(Number(parsed.maxPositions)) &&
        Number(parsed.maxPositions) >= 1 &&
        Number(parsed.maxPositions) <= 50
          ? Number(parsed.maxPositions)
          : DEFAULT_TRADING_PREFS.maxPositions,
    };
  } catch {
    return DEFAULT_TRADING_PREFS;
  }
}

export function saveTradingPrefs(prefs: TradingPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Abaikan jika storage penuh / mode privat
  }
}

export type PositionSizingResult = {
  lots: number;
  shares: number;
  estimatedCostRp: number;
  maxRiskAllowedRp: number;
  actualRiskRp: number;
  riskPerShareRp: number;
  allocationPct: number;
  regimeMultiplier: number; // 1.0 jika IHSG Bullish (Rp 40jt), 0.5 jika IHSG Bearish (Rp 20jt)
  cappedBySlotBudget: boolean;
};

/**
 * Menghitung ukuran lot ideal berbasis Skenario A (Modal dibagi 25 slot = 4% per saham,
 * otomatis dipangkas 50% menjadi 2% per saham saat IHSG Bearish) & batas risiko SL maksimal -8%.
 */
export function computePositionSizing(params: {
  entryPrice: number;
  stopLossPrice: number;
  prefs: TradingPrefs;
  ihsgBullish: boolean | null;
}): PositionSizingResult {
  const { entryPrice, stopLossPrice, prefs, ihsgBullish } = params;
  const regimeMultiplier = ihsgBullish === false ? 0.5 : 1.0;

  if (entryPrice <= 0 || stopLossPrice <= 0 || entryPrice <= stopLossPrice) {
    return {
      lots: 0,
      shares: 0,
      estimatedCostRp: 0,
      maxRiskAllowedRp: 0,
      actualRiskRp: 0,
      riskPerShareRp: 0,
      allocationPct: 0,
      regimeMultiplier,
      cappedBySlotBudget: false,
    };
  }

  const effectiveCapital = prefs.capitalRp * regimeMultiplier;
  const maxAllocationPerSlotRp = effectiveCapital / Math.max(1, prefs.maxPositions);
  const costPerLotRp = entryPrice * 100;
  const lotsBySlot = Math.floor(maxAllocationPerSlotRp / costPerLotRp);

  const maxRiskAllowedRp = effectiveCapital * (prefs.riskPerTradePct / 100);
  const riskPerShareRp = entryPrice - stopLossPrice;
  const riskPerLotRp = riskPerShareRp * 100;
  const lotsByRisk = Math.floor(maxRiskAllowedRp / riskPerLotRp);

  const lots = Math.max(0, Math.min(lotsByRisk, lotsBySlot));
  const shares = lots * 100;
  const estimatedCostRp = shares * entryPrice;
  const actualRiskRp = shares * riskPerShareRp;
  const allocationPct = prefs.capitalRp > 0 ? (estimatedCostRp / prefs.capitalRp) * 100 : 0;

  return {
    lots,
    shares,
    estimatedCostRp,
    maxRiskAllowedRp,
    actualRiskRp,
    riskPerShareRp,
    allocationPct,
    regimeMultiplier,
    cappedBySlotBudget: lotsBySlot <= lotsByRisk && lots > 0,
  };
}

/** Hitung Skor Kesehatan Posisi (0–100) sesuai aturan SL-7 */
function computeHealthScore(params: {
  isBullish: boolean;
  belowStStreak: number;
  closeBreachedSl: boolean;
  intradayTouchedSl: boolean;
  pnlPct: number;
  dayChangePct: number;
  holdingBars: number;
  isBreakevenOrBetter: boolean;
  heavyDistribution: boolean;
  strongBreakoutBar: boolean;
  distAtr: number;
  installedSlRiskFromBuyPct: number | null;
  currentSetupScore: number | null;
}): {
  score: number;
  label: string;
  colorCls: string;
  cardTintCls: string;
  reasons: HealthFactor[];
} {
  const {
    isBullish,
    belowStStreak,
    closeBreachedSl,
    intradayTouchedSl,
    pnlPct,
    dayChangePct,
    holdingBars,
    isBreakevenOrBetter,
    heavyDistribution,
    strongBreakoutBar,
    distAtr,
    installedSlRiskFromBuyPct,
    currentSetupScore,
  } = params;

  const reasons: HealthFactor[] = [];

  // Konfirmasi keluar penuh SL-7: Close tembus SL terpasang, atau 2 hari berturut-turut di bawah ST,
  // atau hari ke-1 di bawah ST dengan floating loss <= -5%
  const confirmedExit =
    closeBreachedSl ||
    belowStStreak >= SOP_BENCHMARK_CONFIG.bearishFlipConfirmDays ||
    (!isBullish && pnlPct <= SOP_BENCHMARK_CONFIG.bearishFlipImmediateLossPct);

  if (confirmedExit) {
    reasons.push({
      label: closeBreachedSl
        ? "Close Tembus Auto-SL Terpasang"
        : belowStStreak >= 2
        ? "Konfirmasi 2 Hari di Bawah Supertrend"
        : `Bearish Flip & Rugi ≤ ${SOP_BENCHMARK_CONFIG.bearishFlipImmediateLossPct}%`,
      delta: -60,
      detail: closeBreachedSl
        ? "Harga penutupan sudah melewati batas Stop Loss yang dipasang."
        : "Sinyal keluar terkonfirmasi sesuai aturan SL-7. Eksekusi jual saat pembukaan.",
    });
    return {
      score: 8,
      label: "Kritis · Jual Besok",
      colorCls: "text-rose-700 bg-rose-100",
      cardTintCls: "bg-gradient-to-br from-rose-50/90 via-white to-white",
      reasons,
    };
  }

  let score = 68;
  if (!isBullish && belowStStreak === 1) {
    score -= 24;
    reasons.push({
      label: "Waspada Hari ke-1 di Bawah Supertrend",
      delta: -24,
      detail:
        "Hari pertama tutup di bawah garis ST namun rugi masih > -5%. Tahan 1 hari untuk konfirmasi (aturan SL-7).",
    });
  } else {
    reasons.push({
      label: "Tren Supertrend Bullish",
      delta: 68,
      detail: "Skor dasar selama harga bertahan di atas garis Supertrend.",
    });
  }

  // 1. Pengaruh P/L saat ini (-20 s/d +22)
  const pnlDelta = Math.round(Math.max(-20, Math.min(22, pnlPct * 1.6)));
  if (pnlDelta !== 0) {
    score += pnlDelta;
    reasons.push({
      label: pnlDelta > 0 ? "Bantalan Floating Profit" : "Posisi Floating Loss",
      delta: pnlDelta,
      detail:
        pnlDelta > 0
          ? `Keuntungan berjalan +${pnlPct.toFixed(1)}% memberi ruang aman terhadap fluktuasi.`
          : `Posisi sedang rugi ${pnlPct.toFixed(1)}% dari harga beli (Hard SL di -8.0%).`,
    });
  } else {
    reasons.push({
      label: "Harga di Area Beli (Impas)",
      delta: 0,
      detail: `Perubahan harga masih tipis (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%).`,
    });
  }

  // 2. Bonus jika SL sudah di atas harga beli (Breakeven Lock aktif >= +8%)
  if (isBreakevenOrBetter) {
    score += 14;
    reasons.push({
      label: "Breakeven Lock Aktif (Zero Risk)",
      delta: 14,
      detail: "Auto-SL sudah dikunci di atas harga beli (+0.5% atau lebih).",
    });
  }

  // 3. Pengaruh skor setup screener terbaru (jika tersedia)
  if (currentSetupScore !== null) {
    if (currentSetupScore >= 86) {
      score += 6;
      reasons.push({
        label: `Skor Screener Elite (${currentSetupScore}/100)`,
        delta: 6,
        detail: "Struktur teknikal saat ini masih masuk peringkat Top Pick bursa.",
      });
    } else if (currentSetupScore < 57) {
      score -= 12;
      reasons.push({
        label: `Skor Screener Melemah (${currentSetupScore}/100)`,
        delta: -12,
        detail: "Struktur harga mulai memasuki fase sideways atau kehilangan momentum.",
      });
    }
  }

  // 4. Pengaruh momentum harian terbaru
  if (strongBreakoutBar) {
    score += 7;
    reasons.push({
      label: "Candle Penguatan Bervolume",
      delta: 7,
      detail: `Harga ditutup menguat +${dayChangePct.toFixed(1)}% di area atas dengan dukungan volume.`,
    });
  } else if (dayChangePct <= -3.5) {
    score -= 10;
    reasons.push({
      label: `Tekanan Turun Harian (${dayChangePct.toFixed(1)}%)`,
      delta: -10,
      detail: "Terjadi penurunan harian tajam; pastikan Hard Auto-SL -8% aktif di sekuritas.",
    });
  }

  // 5. Penalti waktu pegang jika stagnan (Time-Stop 20 bar < +4%)
  if (holdingBars >= 20 && pnlPct < 4) {
    score -= 28;
    reasons.push({
      label: `Time-Stop ≥ 20 Hari Bursa (${holdingBars}h)`,
      delta: -28,
      detail: "Melewati batas horizon optimal 20 hari bursa tanpa kenaikan minimal +4%.",
    });
  } else if (holdingBars >= 13 && pnlPct <= 1.5) {
    score -= 16;
    reasons.push({
      label: `Mulai Stagnan (${holdingBars} Hari Bursa)`,
      delta: -16,
      detail: "Mendekati batas evaluasi 20 hari bursa sementara harga masih jalan di tempat.",
    });
  } else if (holdingBars > 25 && pnlPct < 15) {
    score -= 10;
    reasons.push({
      label: `Tren Matang (${holdingBars} Hari Bursa)`,
      delta: -10,
      detail: "Durasi pegang sudah melampaui 25 hari bursa; kawal konfirmasi penutupan Supertrend.",
    });
  } else {
    reasons.push({
      label: `Usia Pegang Ideal (${holdingBars} Hari Bursa)`,
      delta: 0,
      detail: "Masih berada dalam rentang waktu optimal swing 1–20 hari bursa.",
    });
  }

  // 6. Penalti kondisi teknikal & disiplin SL
  if (intradayTouchedSl) {
    score -= 25;
    reasons.push({
      label: "Low Intraday Sentuh Auto-SL",
      delta: -25,
      detail: "Harga terendah hari ini menyentuh batas SL terpasang (cek eksekusi di sekuritas).",
    });
  }

  if (heavyDistribution) {
    score -= 18;
    reasons.push({
      label: "Volume Distribusi Besar",
      delta: -18,
      detail: "Candle merah ditutup di bawah 25% rentang harian dengan volume >2x rata-rata.",
    });
  }

  if (installedSlRiskFromBuyPct !== null && installedSlRiskFromBuyPct < -8.5) {
    score -= 12;
    reasons.push({
      label: `SL Terpasang Terlalu Lebar (${installedSlRiskFromBuyPct.toFixed(1)}%)`,
      delta: -12,
      detail: "Batas risiko SL terpasang lebih dalam dari aturan Hard SL -8.0%.",
    });
  }

  if (isBullish && distAtr < 0.4) {
    score -= 6;
    reasons.push({
      label: "Dekat Garis Supertrend",
      delta: -6,
      detail: `Jarak ke garis ST tipis (${distAtr.toFixed(2)} ATR), namun tetap terlindungi konfirmasi 2 hari SL-7.`,
    });
  }

  const clamped = Math.max(5, Math.min(98, Math.round(score)));

  if (clamped >= 80) {
    return {
      score: clamped,
      label: "Sangat Aman",
      colorCls: "text-emerald-800 bg-emerald-100",
      cardTintCls: "bg-gradient-to-br from-emerald-50/75 via-white to-white",
      reasons,
    };
  }
  if (clamped >= 62) {
    return {
      score: clamped,
      label: "Sehat · Hold",
      colorCls: "text-teal-800 bg-teal-100/80",
      cardTintCls: "bg-gradient-to-br from-teal-50/50 via-white to-white",
      reasons,
    };
  }
  if (clamped >= 42) {
    return {
      score: clamped,
      label: "Waspada",
      colorCls: "text-amber-800 bg-amber-100",
      cardTintCls: "bg-gradient-to-br from-amber-50/75 via-white to-white",
      reasons,
    };
  }
  return {
    score: clamped,
    label: "Rawan · Evaluasi",
    colorCls: "text-orange-800 bg-orange-100",
    cardTintCls: "bg-gradient-to-br from-orange-50/80 via-white to-white",
    reasons,
  };
}

export type EvaluatePositionContext = {
  ihsgBullish?: boolean | null;
  prefs?: TradingPrefs;
  sameTickerPositions?: PositionRow[];
  currentSetupScore?: number | null;
};

/**
 * Mengevaluasi posisi terbuka berdasarkan aturan SL-7 (Hard SL -8% saat entry,
 * Breakeven Lock +0.5% saat profit >= +8%, dan 2-Day Bearish Flip Confirmation).
 */
export function evaluatePosition(
  pos: PositionRow,
  bars: VBar[],
  st: STPoint[],
  ctx?: EvaluatePositionContext
): PositionAdvice | null {
  if (bars.length === 0 || st.length === 0) return null;

  const ihsgBullish = ctx?.ihsgBullish ?? null;
  const prefs = ctx?.prefs ?? DEFAULT_TRADING_PREFS;
  const sameTickerCount = ctx?.sameTickerPositions?.length ?? 1;
  const currentSetupScore = ctx?.currentSetupScore ?? null;

  const lastBar = bars[bars.length - 1];
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : null;
  const lastSt = st[st.length - 1];
  const currentPrice = lastBar.close;
  const dayChangePct =
    prevBar && prevBar.close > 0 ? ((currentPrice - prevBar.close) / prevBar.close) * 100 : 0;

  const holdingBars = Math.max(1, bars.filter((b) => b.date >= pos.buy_date).length);
  const daysToTimeStop = Math.max(0, SOP_BENCHMARK_CONFIG.timeStopBars - holdingBars);

  const shares = pos.lots * 100;
  const costBasis = pos.buy_price * shares;
  const marketValue = currentPrice * shares;
  const pnlRp = marketValue - costBasis;
  const pnlPct = costBasis > 0 ? ((currentPrice - pos.buy_price) / pos.buy_price) * 100 : 0;
  const netBreakevenPrice = ceilToIdxTick(pos.buy_price * 1.004); // kompensasi fee beli + jual ~0.40%

  // Hitung jumlah hari berturut-turut Close < Garis Supertrend (sejak tanggal beli)
  const stOffset = bars.length - st.length;
  let belowStStreak = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].date < pos.buy_date) break;
    const stIdx = i - stOffset;
    if (stIdx < 0 || stIdx >= st.length) break;
    const pt = st[stIdx];
    const barBearish = pt.trend === -1 || bars[i].close < pt.up;
    if (barBearish) {
      belowStStreak++;
    } else {
      break;
    }
  }

  const isBullish = lastSt.trend === 1 && currentPrice >= lastSt.up;
  const stLine = lastSt.trend === 1 ? lastSt.up : lastSt.dn;

  // Aturan SL-7:
  // - Default: Hard Auto-SL di -8.0% dari harga beli (tidak perlu digeser tiap malam)
  // - Jika floating profit >= +8.0%: aktifkan Breakeven Lock di harga beli + 0.5%
  const hardSlPrice = calcHardSlPrice(pos.buy_price);
  const breakevenLockPrice = calcBreakevenLockPrice(pos.buy_price);
  const targetSlByRule =
    pnlPct >= SOP_BENCHMARK_CONFIG.breakevenLockTriggerPct
      ? Math.max(hardSlPrice, breakevenLockPrice)
      : hardSlPrice;

  const suggestedSl =
    pos.sl_installed !== null ? Math.max(pos.sl_installed, targetSlByRule) : targetSlByRule;

  const slRiskFromCurrentPct =
    suggestedSl && currentPrice > 0 ? ((suggestedSl - currentPrice) / currentPrice) * 100 : 0;

  const referenceSl =
    pos.sl_installed !== null ? Math.max(pos.sl_installed, suggestedSl) : suggestedSl;
  const lockedPnlRp =
    referenceSl !== null && shares > 0 ? (referenceSl - pos.buy_price) * shares : null;
  const lockedPnlPct =
    referenceSl !== null && pos.buy_price > 0
      ? ((referenceSl - pos.buy_price) / pos.buy_price) * 100
      : null;

  const isBreakevenOrBetter =
    (suggestedSl !== null && suggestedSl >= netBreakevenPrice) ||
    (pos.sl_installed !== null && pos.sl_installed >= netBreakevenPrice);

  const installedSlRiskFromBuyPct =
    pos.sl_installed !== null && pos.buy_price > 0
      ? ((pos.sl_installed - pos.buy_price) / pos.buy_price) * 100
      : null;

  const distAtr = isBullish && lastSt.atr > 0 ? (currentPrice - lastSt.up) / lastSt.atr : 0;

  const recent20 = bars.slice(-20);
  const avgVol20 =
    recent20.length > 0
      ? recent20.reduce((sum, b) => sum + b.volume, 0) / recent20.length
      : 0;
  const barRange = Math.max(1, lastBar.high - lastBar.low);
  const closePosInBar = (lastBar.close - lastBar.low) / barRange;

  const heavyDistribution =
    lastBar.close < lastBar.open &&
    avgVol20 > 0 &&
    lastBar.volume >= avgVol20 * 2 &&
    closePosInBar < 0.25;

  const strongBreakoutBar =
    lastBar.close > lastBar.open &&
    dayChangePct >= 3 &&
    avgVol20 > 0 &&
    lastBar.volume >= avgVol20 * 1.4 &&
    closePosInBar >= 0.75;

  const closeBreachedSl = pos.sl_installed !== null && currentPrice <= pos.sl_installed;
  const intradayTouchedSl =
    pos.sl_installed !== null &&
    lastBar.low <= pos.sl_installed &&
    currentPrice > pos.sl_installed;

  // Hitung kesiapan Add-On (Pyramiding)
  const scoreAllowsAddOn = currentSetupScore === null || currentSetupScore >= 80;
  const addOnReady =
    isBullish &&
    !closeBreachedSl &&
    !intradayTouchedSl &&
    scoreAllowsAddOn &&
    sameTickerCount === 1 &&
    ihsgBullish !== false &&
    isBreakevenOrBetter &&
    pnlPct >= 8 &&
    pnlPct <= 14 &&
    holdingBars >= 3 &&
    holdingBars <= 12 &&
    distAtr >= 0.6 &&
    distAtr <= 2.0 &&
    !heavyDistribution;

  const addOnSizing =
    addOnReady && suggestedSl !== null
      ? computePositionSizing({
          entryPrice: currentPrice,
          stopLossPrice: suggestedSl,
          prefs,
          ihsgBullish,
        })
      : null;
  const addOnSuggestedLots = addOnSizing ? Math.max(0, Math.floor(addOnSizing.lots * 0.5)) : 0;

  const health = computeHealthScore({
    isBullish,
    belowStStreak,
    closeBreachedSl,
    intradayTouchedSl,
    pnlPct,
    dayChangePct,
    holdingBars,
    isBreakevenOrBetter,
    heavyDistribution,
    strongBreakoutBar,
    distAtr,
    installedSlRiskFromBuyPct,
    currentSetupScore,
  });

  const last3Bars = bars.slice(-3);
  const low3 = last3Bars.length > 0 ? Math.min(...last3Bars.map((b) => b.low)) : stLine;
  const tightProfitSl = floorToIdxTick(low3, 1);
  const todayLowSl = floorToIdxTick(lastBar.low, 1);

  const fmtRp = (v: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(v))}`;

  const base = {
    healthScore: health.score,
    healthLabel: health.label,
    healthColorCls: health.colorCls,
    cardTintCls: health.cardTintCls,
    healthReasons: health.reasons,
    belowStStreak,
    holdingBars,
    daysToTimeStop,
    currentPrice,
    netBreakevenPrice,
    stLine,
    pnlRp,
    pnlPct,
    marketValue,
    slRiskFromCurrentPct,
    lockedPnlRp,
    lockedPnlPct,
    isBreakevenOrBetter,
    currentSetupScore,
    addOnReady: addOnReady && addOnSuggestedLots > 0,
    addOnSuggestedLots,
  };

  // 1. PRIORITAS TERTINGGI: Close tembus SL terpasang, 2 hari berturut-turut di bawah ST,
  //    atau hari ke-1 di bawah ST dengan floating loss <= -5.0% (Aturan SL-7)
  const isConfirmedBearishExit =
    belowStStreak >= SOP_BENCHMARK_CONFIG.bearishFlipConfirmDays ||
    (!isBullish && pnlPct <= SOP_BENCHMARK_CONFIG.bearishFlipImmediateLossPct);

  if (closeBreachedSl || isConfirmedBearishExit) {
    const reasonText = closeBreachedSl
      ? `Harga penutupan (${fmtRp(currentPrice)}) sudah menyentuh/menembus batas Auto-SL terpasang (${fmtRp(pos.sl_installed!)}).`
      : belowStStreak >= 2
      ? `Harga ditutup di bawah garis Supertrend (${fmtRp(stLine)}) selama ${belowStStreak} hari bursa berturut-turut (konfirmasi 2 hari SL-7 tercapai).`
      : `Harga ditutup di bawah garis Supertrend (${fmtRp(stLine)}) dan posisi sedang rugi ${pnlPct.toFixed(1)}% (melewati batas -5.0% untuk pangkas rugi cepat).`;

    return {
      ...base,
      code: "EXIT_STOP",
      badge: closeBreachedSl
        ? "JUAL BESOK · Kena SL"
        : belowStStreak >= 2
        ? "JUAL BESOK · Konfirmasi 2H"
        : "JUAL BESOK · Cut Loss",
      badgeCls: "bg-rose-600 text-white",
      borderCls: "border-rose-400",
      headline: "Pasang order jual penuh saat market buka besok pagi (Prioritas 1).",
      detail: reasonText,
      suggestedSl: null,
    };
  }

  // 2. PRIORITAS KEDUA: Low intraday menyentuh SL terpasang, tapi Close memantul di atasnya
  if (intradayTouchedSl) {
    return {
      ...base,
      code: "CHECK_INTRADAY_SL",
      badge: "CEK SEKURITAS · SL Tersentuh",
      badgeCls: "bg-rose-500 text-white",
      borderCls: "border-rose-300",
      headline: `Low hari ini (${fmtRp(lastBar.low)}) menyentuh SL terpasang (${fmtRp(pos.sl_installed!)}), meski tutup di ${fmtRp(currentPrice)}.`,
      detail: `Periksa status auto-order di aplikasi sekuritas Anda. Jika barang sudah terjual otomatis, klik "Catat Jual". Jika belum terjual, pastikan SL aktif di ${fmtRp(suggestedSl)}.`,
      suggestedSl,
    };
  }

  // 3. PRIORITAS KETIGA (KHAS SL-7): Hari ke-1 tutup di bawah garis ST, tapi P/L masih > -5.0%
  if (!isBullish && belowStStreak === 1) {
    return {
      ...base,
      code: "BEARISH_FLIP_WARN",
      badge: "WASPADA HARI KE-1 · Tahan",
      badgeCls: "bg-amber-600 text-white",
      borderCls: "border-amber-400",
      headline: `Tutup tipis di bawah garis ST (${fmtRp(currentPrice)} < ${fmtRp(stLine)}), tetapi masih aman dari batas -5%. Tahan 1 hari konfirmasi.`,
      detail: `Sesuai aturan SL-7 (2-Day Flip Confirm), jangan panik menjual pada hari pertama penembusan tipis. Jika besok tutup kembali di atas ${fmtRp(stLine)}, lanjut HOLD; jika kembali tutup di bawah ST (hari ke-2), jual penuh lusa pagi. Pastikan Auto-SL tetap aktif di ${fmtRp(pos.sl_installed ?? suggestedSl)}.`,
      suggestedSl,
    };
  }

  // 4. PRIORITAS KEEMPAT: Pasang Hard SL awal (-8%) atau aktifkan Breakeven Lock (+0.5% saat profit >= +8%)
  const needsSlUpdate =
    pos.sl_installed === null ||
    (pnlPct >= SOP_BENCHMARK_CONFIG.breakevenLockTriggerPct &&
      pos.sl_installed < breakevenLockPrice);

  if (needsSlUpdate) {
    const isInitial = pos.sl_installed === null;
    const isLockingBreakeven = pnlPct >= SOP_BENCHMARK_CONFIG.breakevenLockTriggerPct;
    const lockedProfitPct = ((suggestedSl - pos.buy_price) / pos.buy_price) * 100;

    return {
      ...base,
      code: "RAISE_SL",
      badge: isInitial
        ? "PASANG HARD SL (-8%)"
        : isLockingBreakeven
        ? "KUNCI IMPAS · Zero Risk"
        : "SESUAIKAN AUTO-SL",
      badgeCls: "bg-emerald-600 text-white",
      borderCls: "border-emerald-300",
      headline: isInitial
        ? `Pasang Hard Auto-SL awal di ${fmtRp(suggestedSl)} (-8.0% dari harga beli).`
        : `Profit sudah +${pnlPct.toFixed(1)}% (≥ +8%). Geser Auto-SL ke ${fmtRp(suggestedSl)} untuk kunci modal!`,
      detail: isInitial
        ? `Dengan aturan SL-7, Anda cukup memasang Hard Auto-SL sekali di ${fmtRp(suggestedSl)} dan membiarkan tren berjalan sampai muncul konfirmasi 2 hari Bearish Flip.`
        : `Floating profit telah melewati ambang +8.0%. Menaikkan Auto-SL dari ${fmtRp(pos.sl_installed!)} ke ${fmtRp(suggestedSl)} (${lockedProfitPct >= 0 ? `+${lockedProfitPct.toFixed(1)}%` : `${lockedProfitPct.toFixed(1)}%`}) menghilangkan risiko kerugian pokok modal.`,
      suggestedSl,
    };
  }

  // 5. PRIORITAS KELIMA: SL terpasang terlalu lebar (> -8.5% dari harga beli)
  if (
    installedSlRiskFromBuyPct !== null &&
    installedSlRiskFromBuyPct < -8.5 &&
    hardSlPrice > pos.sl_installed!
  ) {
    return {
      ...base,
      code: "SL_TOO_WIDE",
      badge: "PERKETAT SL · Risiko > 8%",
      badgeCls: "bg-rose-600 text-white",
      borderCls: "border-rose-300",
      headline: `SL terpasang (${fmtRp(pos.sl_installed!)}) berisiko ${installedSlRiskFromBuyPct.toFixed(1)}% dari harga beli. Naikkan ke ${fmtRp(hardSlPrice)}.`,
      detail: `Aturan Skenario A + SL-7 membatasi Hard Auto-SL maksimal di -8.0% (${fmtRp(hardSlPrice)}) dari harga beli agar kerugian tetap terkendali.`,
      suggestedSl: hardSlPrice,
    };
  }

  // 6. PRIORITAS KEENAM: Lonjakan parabolik (+12% sehari) atau melesat > 4.2 ATR -> TP Parsial 50%
  if (dayChangePct >= SOP_BENCHMARK_CONFIG.partialTpDailyJumpPct || (distAtr >= 4.2 && pnlPct >= 15)) {
    const spikeSl =
      todayLowSl > (pos.sl_installed ?? 0) && todayLowSl < currentPrice ? todayLowSl : tightProfitSl;
    const useSpikeSl = spikeSl > (pos.sl_installed ?? 0) && spikeSl < currentPrice;
    const activeSl = useSpikeSl ? spikeSl : suggestedSl;
    const lockedPct = activeSl ? ((activeSl - pos.buy_price) / pos.buy_price) * 100 : 0;

    return {
      ...base,
      code: "PARABOLIC_SPIKE",
      badge: "TP PARSIAL 50% · Lonjakan Ekstrem",
      badgeCls: "bg-emerald-700 text-white",
      borderCls: "border-emerald-400",
      headline: `Harga melesat +${dayChangePct.toFixed(1)}% hari ini (total +${pnlPct.toFixed(1)}%). Jual 50% lot & kunci sisa lot!`,
      detail: useSpikeSl
        ? `Sesuai SOP TP Bertahap, amankan 50% lot sekarang dan geser Auto-SL sisa 50% lot ke Low 3 hari (${fmtRp(spikeSl)}, mengunci +${lockedPct.toFixed(1)}%).`
        : `Kenaikan sudah melampaui +12% dalam sehari. Realisasikan 50% lot untuk mengunci keuntungan dan biarkan sisanya mengikuti tren.`,
      suggestedSl: activeSl,
    };
  }

  // 7. PRIORITAS KETUJUH: Profit lebar (>= +15%) -> Opsi TP Parsial 50% + Geser SL ke Low 3 hari
  if (pnlPct >= SOP_BENCHMARK_CONFIG.partialTpFloatingPct) {
    const useTight = tightProfitSl > (pos.sl_installed ?? 0) && tightProfitSl < currentPrice;
    const activeSl = useTight ? tightProfitSl : suggestedSl;
    const lockedPct = activeSl ? ((activeSl - pos.buy_price) / pos.buy_price) * 100 : 0;

    return {
      ...base,
      code: "EXTENDED_PROFIT",
      badge: "PROFIT ≥ +15% · TP Bertahap",
      badgeCls: "bg-emerald-700 text-white",
      borderCls: "border-emerald-300",
      headline: `Profit sudah +${pnlPct.toFixed(1)}%. ${
        useTight
          ? `TP 50% lot & geser SL sisa lot ke Low 3 hari: ${fmtRp(tightProfitSl)} (kunci +${lockedPct.toFixed(1)}%).`
          : "Pertimbangkan TP parsial 50% lot atau kawal dengan konfirmasi 2 hari ST."
      }`,
      detail: `Target TP parsial SOP (+15%) telah tercapai. Anda dapat melepas 50% lot dan menggeser SL sisa lot ke bawah Low 3 bar terakhir (${fmtRp(tightProfitSl)}) sambil membiarkan sisa posisi berlari.`,
      suggestedSl: activeSl,
    };
  }

  // 8. PRIORITAS KEDELAPAN: Time-Stop (Sudah >= 20 hari bursa tapi stagnan < +4%)
  if (
    holdingBars >= SOP_BENCHMARK_CONFIG.timeStopBars &&
    pnlPct < SOP_BENCHMARK_CONFIG.timeStopMinProfitPct
  ) {
    return {
      ...base,
      code: "TIME_STOP",
      badge: "JUAL BESOK · Time-Stop 20H",
      badgeCls: "bg-amber-600 text-white",
      borderCls: "border-amber-300",
      headline: `Sudah dipegang ${holdingBars} hari bursa dengan return ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% (< +4%). Jual & rotasi modal.`,
      detail: `Sesuai aturan Time-Stop SOP, saham yang belum naik minimal +4% setelah 20 hari bursa sebaiknya dijual saat market buka untuk memutar kas ke kandidat Top Pick (Skor ≥ 86) yang baru.`,
      suggestedSl,
    };
  }

  // 9. PRIORITAS KESEMBILAN: Tekanan koreksi tajam mendekati SL (< 1.8% jarak ke SL)
  const distToActiveSlPct =
    pos.sl_installed && currentPrice > 0
      ? ((currentPrice - pos.sl_installed) / currentPrice) * 100
      : Math.abs(slRiskFromCurrentPct);

  if (dayChangePct <= -3.5 && distToActiveSlPct <= 1.8) {
    return {
      ...base,
      code: "GAP_WARNING",
      badge: "SIAGA · Mepet Hard SL",
      badgeCls: "bg-amber-600 text-white",
      borderCls: "border-amber-300",
      headline: `Turun ${dayChangePct.toFixed(1)}% hari ini; harga hanya terpaut ${distToActiveSlPct.toFixed(1)}% di atas Auto-SL (${fmtRp(pos.sl_installed ?? suggestedSl)}).`,
      detail: `Pastikan auto-order SL di sekuritas aktif agar jika besok pagi dibuka melemah di bawah batas SL, kerugian langsung terpotong otomatis.`,
      suggestedSl,
    };
  }

  // 10. PRIORITAS KESEPULUH: Peringatan dini stagnan (hari ke-13 s/d 19), volume distribusi, atau skor turun drastis
  const scoreDegraded = currentSetupScore !== null && currentSetupScore < 57;
  if (heavyDistribution || (holdingBars >= 13 && pnlPct <= 1.5) || scoreDegraded) {
    return {
      ...base,
      code: "WATCH_MOMENTUM",
      badge: heavyDistribution
        ? "WASPADA DISTRIBUSI"
        : scoreDegraded
        ? `WASPADA SIDEWAYS · Skor ${currentSetupScore}`
        : `PANTAU KETAT · H-${holdingBars}`,
      badgeCls: "bg-amber-500 text-white",
      borderCls: "border-amber-300",
      headline: heavyDistribution
        ? `Muncul candle merah bervolume besar (>2x rata-rata). Pastikan Hard SL aktif di ${fmtRp(pos.sl_installed ?? suggestedSl)}.`
        : scoreDegraded
        ? `Skor struktur tren turun ke ${currentSetupScore}/100 (terdeteksi sideways). Jangan tambah lot baru.`
        : `Sudah ${holdingBars} hari bursa (sisa ${daysToTimeStop} hari evaluasi Time-Stop) dan harga masih jalan di tempat (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%).`,
      detail: heavyDistribution
        ? `Terjadi tekanan jual besar hari ini. Jangan menambah posisi; biarkan Hard Auto-SL (-8%) menjaga batas risiko Anda.`
        : scoreDegraded
        ? `Indikator momentum mulai melemah. Pertahankan posisi selama belum kena SL atau konfirmasi 2 hari di bawah Supertrend.`
        : `Mendekati batas evaluasi 20 hari bursa. Jika belum mampu menembus +4%, bersiaplah melakukan rotasi modal.`,
      suggestedSl,
    };
  }

  // 11. PRIORITAS KESEBELAS: Tren matang (> 25 hari bursa) dalam kondisi profit
  if (holdingBars > 25 && pnlPct >= 4) {
    const useTight = tightProfitSl > (pos.sl_installed ?? 0) && tightProfitSl < currentPrice;
    return {
      ...base,
      code: "MATURE_TREND_PROFIT",
      badge: `TREN MATANG · H-${holdingBars}`,
      badgeCls: "bg-teal-700 text-white",
      borderCls: "border-teal-300",
      headline: `Posisi sudah berjalan ${holdingBars} hari bursa (+${pnlPct.toFixed(1)}%). Biarkan pemenang berlari dengan pengawalan SL-7.`,
      detail: useTight
        ? `Durasi pegang sudah melampaui 25 hari. Anda bisa menggeser SL ke Low 3 bar (${fmtRp(tightProfitSl)}) atau tetap membiarkannya mengikuti konfirmasi 2 hari Supertrend.`
        : `Pertahankan Auto-SL di ${fmtRp(pos.sl_installed ?? suggestedSl)} dan biarkan tren berjalan hingga muncul 2 hari penutupan di bawah Supertrend.`,
      suggestedSl: useTight ? tightProfitSl : suggestedSl,
    };
  }

  // 12. PRIORITAS KEDUABELAS: Kandidat Pyramiding / Add-on
  if (addOnReady && addOnSuggestedLots > 0) {
    return {
      ...base,
      code: "PYRAMIDING_READY",
      badge: "SIAP ADD-ON · Zero Risk",
      badgeCls: "bg-sky-700 text-white",
      borderCls: "border-sky-300",
      headline: `Modal awal sudah aman (Breakeven Lock aktif) & tren menguat (+${pnlPct.toFixed(1)}%).`,
      detail: `Jika slot portofolio (< 25) masih tersedia, posisi ini memenuhi syarat untuk pyramiding (+${addOnSuggestedLots} lot) dengan batas SL di ${fmtRp(pos.sl_installed ?? suggestedSl)}.`,
      suggestedSl,
    };
  }

  // 13. PRIORITAS KETIGABELAS: Fase inkubasi awal (Baru pegang 1–3 hari bursa)
  if (holdingBars <= 3) {
    return {
      ...base,
      code: "FRESH_ENTRY_MONITOR",
      badge: `POSISI BARU · H-${holdingBars}`,
      badgeCls: "bg-slate-800 text-white",
      borderCls: "border-emerald-200",
      headline: `Fase awal swing (hari ke-${holdingBars}). Biarkan harga bernapas dengan Hard SL di ${fmtRp(pos.sl_installed ?? suggestedSl)}.`,
      detail: `Pada 1–3 hari pertama setelah beli, wajar jika harga menguji area breakout. Anda tidak perlu menggeser SL setiap malam—cukup pastikan Hard SL -8% terpasang di sekuritas.`,
      suggestedSl,
    };
  }

  // 14. KONDISI NORMAL: Tahan posisi (Hold)
  return {
    ...base,
    code: "HOLD",
    badge: "TAHAN POSISI (HOLD)",
    badgeCls: "bg-slate-800 text-white",
    borderCls: "border-emerald-200",
    headline: `Pertahankan posisi · Auto-SL aktif di ${fmtRp(pos.sl_installed ?? suggestedSl)}.`,
    detail: `Tren Bullish sehat (hari ke-${holdingBars}, sisa ${daysToTimeStop} hari menuju evaluasi 20h, garis ST di ${fmtRp(stLine)}).`,
    suggestedSl,
  };
}

/** Pembangun teks Morning Action Sheet gabungan (Jual + Geser SL + Antrean Beli Besok Pagi) */
export type MorningBuyCandidate = {
  ticker: string;
  score: number;
  close: number;
  maxBuyLimit: number;
  orderSl: number;
  lots: number;
  estimatedCostRp: number;
};

export function buildMorningActionText(params: {
  dateLabel?: string;
  ihsgBullish: boolean | null;
  openAdvices: { pos: PositionRow; advice: PositionAdvice | null }[];
  buyCandidates: MorningBuyCandidate[];
  maxPositions: number;
}): string {
  const { dateLabel, ihsgBullish, openAdvices, buyCandidates, maxPositions } = params;
  const fmtInt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
  const lines: string[] = [];

  const regimeTxt =
    ihsgBullish === true
      ? "IHSG BULLISH (Alokasi 100% · Rp 40 Jt/Slot)"
      : ihsgBullish === false
      ? "IHSG BEARISH (Defensif 50% · Rp 20 Jt/Slot)"
      : "IHSG –";

  lines.push(`=== MORNING ACTION SHEET · PATOKAN SKENARIO A + SL-7${dateLabel ? ` (${dateLabel})` : ""} ===`);
  lines.push(`Rezim Pasar: ${regimeTxt}`);
  lines.push("");

  // Prioritas 1: Jual / Exit / Time-Stop
  const exits = openAdvices.filter(
    (x) =>
      x.advice &&
      (x.advice.code === "EXIT_STOP" ||
        x.advice.code === "CHECK_INTRADAY_SL" ||
        x.advice.code === "TIME_STOP")
  );
  lines.push(`1) PRIORITAS JUAL / EVALUASI KELUAR (${exits.length})`);
  if (exits.length === 0) {
    lines.push("   - Tidak ada posisi yang wajib dijual saat open.");
  } else {
    let estCash = 0;
    for (const item of exits) {
      const clean = item.pos.ticker.replace(/\.JK$/, "");
      const mv = item.advice?.marketValue ?? item.pos.buy_price * item.pos.lots * 100;
      if (item.advice?.code !== "CHECK_INTRADAY_SL") estCash += mv;
      lines.push(
        `   - ${clean} (${item.pos.lots} Lot): ${item.advice?.badge} | Est. Rp ${fmtInt.format(mv)}`
      );
    }
    if (estCash > 0) {
      lines.push(`   -> Estimasi kas cair kembali: ~Rp ${fmtInt.format(estCash)}`);
    }
  }
  lines.push("");

  // Prioritas 2: Pasang Hard SL (-8%) / Aktifkan Breakeven Lock (+0.5% saat profit >= +8%)
  const slUpdates = openAdvices.filter(
    (x) =>
      x.advice &&
      x.advice.suggestedSl !== null &&
      x.advice.suggestedSl !== x.pos.sl_installed &&
      (x.advice.code === "RAISE_SL" ||
        x.advice.code === "SL_TOO_WIDE" ||
        x.advice.code === "PARABOLIC_SPIKE" ||
        x.advice.code === "EXTENDED_PROFIT" ||
        x.advice.code === "MATURE_TREND_PROFIT")
  );
  lines.push(`2) UPDATE AUTO-SL DI SEKURITAS (${slUpdates.length})`);
  if (slUpdates.length === 0) {
    lines.push("   - Semua posisi aktif sudah memiliki Hard SL (-8%) / Breakeven Lock sesuai aturan SL-7.");
  } else {
    for (const item of slUpdates) {
      const clean = item.pos.ticker.replace(/\.JK$/, "");
      const oldSl = item.pos.sl_installed ? `Rp ${fmtInt.format(item.pos.sl_installed)}` : "Belum ada";
      lines.push(
        `   - ${clean} (${item.pos.lots} Lot): SL ${oldSl} -> Rp ${fmtInt.format(item.advice!.suggestedSl!)} (${item.advice!.badge})`
      );
    }
  }
  lines.push("");

  // Pantauan Waspada Hari ke-1 (Info tambahan agar tidak panik jual)
  const day1Warns = openAdvices.filter((x) => x.advice?.code === "BEARISH_FLIP_WARN");
  if (day1Warns.length > 0) {
    lines.push(`   [Info] Waspada Hari ke-1 di bawah ST (TAHAN 1 hari konfirmasi): ${day1Warns.map((x) => x.pos.ticker.replace(/\.JK$/, "")).join(", ")}`);
    lines.push("");
  }

  // Prioritas 3: Antrean Beli Baru
  const activeCount = openAdvices.filter((x) => x.advice?.code !== "EXIT_STOP").length;
  const freeSlots = Math.max(0, maxPositions - activeCount);
  lines.push(`3) ANTREAN BELI BARU (Slot Tersedia: ${freeSlots} dari ${maxPositions})`);
  if (freeSlots === 0) {
    lines.push("   - Slot portofolio penuh (25/25). Tunggu ada posisi keluar sebelum beli baru.");
  } else if (buyCandidates.length === 0) {
    lines.push("   - Belum ada kandidat Top Pick (Skor >= 86 & SL <= 8%) yang memenuhi syarat.");
  } else {
    for (const c of buyCandidates.slice(0, freeSlots)) {
      const clean = c.ticker.replace(/\.JK$/, "");
      const hardSl = calcHardSlPrice(c.close);
      lines.push(
        `   - ${clean} (Skor ${c.score}): Beli Maks Rp ${fmtInt.format(c.maxBuyLimit)} | ${c.lots} Lot (~Rp ${fmtInt.format(c.estimatedCostRp)}) | Hard SL -8% Rp ${fmtInt.format(hardSl)}`
      );
    }
  }

  return lines.join("\n");
}

export type ExitReasonSummary = {
  reason: ExitReason;
  label: string;
  count: number;
  winRatePct: number;
  avgPnlPct: number;
  totalPnlRp: number;
};

export type PerformanceStats = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  realizedNetRp: number;
  avgWinPct: number;
  avgLossPct: number;
  avgWinRp: number;
  avgLossRp: number;
  expectancyPct: number;
  expectancyRp: number;
  profitFactor: number | null;
  avgHoldDays: number;
  slCompliancePct: number | null;
  oversizedLossesCount: number;
  byExitReason: ExitReasonSummary[];
  bestTrade: { ticker: string; pnlPct: number; pnlRp: number } | null;
  worstTrade: { ticker: string; pnlPct: number; pnlRp: number } | null;
};

/** Menghitung Win Rate, Expectancy, Kepatuhan SL, dan Penambahan Portofolio Bersih */
export function computePerformanceStats(closedPositions: PositionRow[]): PerformanceStats {
  const valid = closedPositions.filter(
    (p) => p.status === "CLOSED" && p.sell_price !== null && p.buy_price > 0
  );

  if (valid.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRatePct: 0,
      realizedNetRp: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      avgWinRp: 0,
      avgLossRp: 0,
      expectancyPct: 0,
      expectancyRp: 0,
      profitFactor: null,
      avgHoldDays: 0,
      slCompliancePct: null,
      oversizedLossesCount: 0,
      byExitReason: [],
      bestTrade: null,
      worstTrade: null,
    };
  }

  let wins = 0;
  let losses = 0;
  let realizedNetRp = 0;
  let grossProfitRp = 0;
  let grossLossRp = 0;
  let sumWinPct = 0;
  let sumLossPct = 0;
  let sumWinRp = 0;
  let sumLossRp = 0;
  let totalHoldDays = 0;
  let oversizedLossesCount = 0;

  const reasonMap = new Map<
    ExitReason,
    { count: number; wins: number; sumPct: number; sumRp: number }
  >();

  let bestTrade: { ticker: string; pnlPct: number; pnlRp: number } | null = null;
  let worstTrade: { ticker: string; pnlPct: number; pnlRp: number } | null = null;

  for (const p of valid) {
    const sPrice = p.sell_price!;
    const shares = p.lots * 100;
    const pnlRp = (sPrice - p.buy_price) * shares;
    const pnlPct = ((sPrice - p.buy_price) / p.buy_price) * 100;

    realizedNetRp += pnlRp;

    if (pnlRp > 0) {
      wins++;
      grossProfitRp += pnlRp;
      sumWinPct += pnlPct;
      sumWinRp += pnlRp;
    } else if (pnlRp < 0) {
      losses++;
      grossLossRp += Math.abs(pnlRp);
      sumLossPct += Math.abs(pnlPct);
      sumLossRp += Math.abs(pnlRp);
      if (pnlPct < -8.5) {
        oversizedLossesCount++;
      }
    }

    if (p.exit_reason) {
      const cur = reasonMap.get(p.exit_reason) ?? { count: 0, wins: 0, sumPct: 0, sumRp: 0 };
      cur.count++;
      if (pnlRp > 0) cur.wins++;
      cur.sumPct += pnlPct;
      cur.sumRp += pnlRp;
      reasonMap.set(p.exit_reason, cur);
    }

    if (p.sell_date) {
      const d1 = new Date(p.buy_date).getTime();
      const d2 = new Date(p.sell_date).getTime();
      if (!Number.isNaN(d1) && !Number.isNaN(d2) && d2 >= d1) {
        totalHoldDays += Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
      }
    }

    const cleanTicker = p.ticker.replace(/\.JK$/, "");
    if (!bestTrade || pnlPct > bestTrade.pnlPct) {
      bestTrade = { ticker: cleanTicker, pnlPct, pnlRp };
    }
    if (!worstTrade || pnlPct < worstTrade.pnlPct) {
      worstTrade = { ticker: cleanTicker, pnlPct, pnlRp };
    }
  }

  const totalTrades = valid.length;
  const winRate = wins / totalTrades;
  const lossRate = losses / totalTrades;

  const avgWinPct = wins > 0 ? sumWinPct / wins : 0;
  const avgLossPct = losses > 0 ? sumLossPct / losses : 0;
  const avgWinRp = wins > 0 ? sumWinRp / wins : 0;
  const avgLossRp = losses > 0 ? sumLossRp / losses : 0;

  const expectancyPct = winRate * avgWinPct - lossRate * avgLossPct;
  const expectancyRp = realizedNetRp / totalTrades;
  const profitFactor = grossLossRp > 0 ? grossProfitRp / grossLossRp : null;
  const avgHoldDays = Math.round(totalHoldDays / totalTrades);

  const slCompliancePct =
    losses > 0 ? ((losses - oversizedLossesCount) / losses) * 100 : null;

  const byExitReason: ExitReasonSummary[] = Array.from(reasonMap.entries())
    .map(([reason, st]) => ({
      reason,
      label: EXIT_REASON_LABELS[reason] ?? reason,
      count: st.count,
      winRatePct: st.count > 0 ? (st.wins / st.count) * 100 : 0,
      avgPnlPct: st.count > 0 ? st.sumPct / st.count : 0,
      totalPnlRp: st.sumRp,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalTrades,
    wins,
    losses,
    winRatePct: winRate * 100,
    realizedNetRp,
    avgWinPct,
    avgLossPct,
    avgWinRp,
    avgLossRp,
    expectancyPct,
    expectancyRp,
    profitFactor,
    avgHoldDays,
    slCompliancePct,
    oversizedLossesCount,
    byExitReason,
    bestTrade,
    worstTrade,
  };
}
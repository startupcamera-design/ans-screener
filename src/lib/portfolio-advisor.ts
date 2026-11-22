import type { VBar } from "./metrics";
import type { STPoint } from "./supertrend";

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
};

export type ActionCode =
  | "EXIT_STOP"
  | "CHECK_INTRADAY_SL"
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
  holdingBars: number;
  currentPrice: number;
  stLine: number;
  pnlRp: number;
  pnlPct: number;
  marketValue: number;
  slRiskFromCurrentPct: number;
  isBreakevenOrBetter: boolean;
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

/** Hitung Skor Kesehatan Posisi (0–100) beserta rincian penyebabnya */
function computeHealthScore(params: {
  isBullish: boolean;
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
}): {
  score: number;
  label: string;
  colorCls: string;
  cardTintCls: string;
  reasons: HealthFactor[];
} {
  const {
    isBullish,
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
  } = params;

  const reasons: HealthFactor[] = [];

  if (!isBullish || closeBreachedSl) {
    reasons.push({
      label: !isBullish ? "Tren Berbalik Bearish" : "Close Tembus SL Terpasang",
      delta: -60,
      detail: !isBullish
        ? "Harga penutupan jatuh di bawah garis Supertrend (sinyal keluar aktif)."
        : "Harga penutupan sudah melewati batas Stop Loss yang dipasang.",
    });
    return {
      score: 8,
      label: "Kritis · Keluar",
      colorCls: "text-rose-700 bg-rose-100",
      cardTintCls: "bg-gradient-to-br from-rose-50/90 via-white to-white",
      reasons,
    };
  }

  let score = 68;
  reasons.push({
    label: "Tren Supertrend Bullish",
    delta: 68,
    detail: "Skor dasar selama harga bertahan di atas garis Supertrend.",
  });

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
          : `Posisi sedang rugi ${pnlPct.toFixed(1)}% dari harga beli.`,
    });
  } else {
    reasons.push({
      label: "Harga di Area Beli (Impas)",
      delta: 0,
      detail: `Perubahan harga masih tipis (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%).`,
    });
  }

  // 2. Bonus jika SL sudah di atas harga beli (zero risk / profit terkunci)
  if (isBreakevenOrBetter) {
    score += 14;
    reasons.push({
      label: "Trailing SL Mengunci Profit",
      delta: 14,
      detail: "Garis SL sudah naik di atas harga beli (risiko modal nol).",
    });
  }

  // 3. Pengaruh momentum harian terbaru
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
      detail: "Terjadi penurunan harian tajam yang menggerus jarak aman menuju garis SL.",
    });
  }

  // 4. Penalti waktu pegang jika stagnan (time decay)
  if (holdingBars >= 20 && pnlPct < 4) {
    score -= 28;
    reasons.push({
      label: `Stagnan ≥ 20 Hari Bursa (${holdingBars}h)`,
      delta: -28,
      detail: "Melewati batas horizon optimal backtest (10–20 hari) tanpa kenaikan berarti.",
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
      detail: "Durasi pegang sudah melampaui 25 hari bursa; perlu pengawalan trailing SL ketat.",
    });
  } else {
    reasons.push({
      label: `Usia Pegang Ideal (${holdingBars} Hari Bursa)`,
      delta: 0,
      detail: "Masih berada dalam rentang waktu optimal swing 1–20 hari bursa.",
    });
  }

  // 5. Penalti kondisi teknikal & disiplin SL
  if (intradayTouchedSl) {
    score -= 25;
    reasons.push({
      label: "Low Intraday Sentuh SL",
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

  if (installedSlRiskFromBuyPct !== null && installedSlRiskFromBuyPct < -8.2) {
    score -= 12;
    reasons.push({
      label: `SL Terpasang Terlalu Lebar (${installedSlRiskFromBuyPct.toFixed(1)}%)`,
      delta: -12,
      detail: "Batas risiko SL terpasang lebih dalam dari aturan maksimal -8% dari harga beli.",
    });
  }

  if (distAtr < 0.4) {
    score -= 10;
    reasons.push({
      label: "Terlalu Mepet Garis SL",
      delta: -10,
      detail: `Jarak harga ke garis Supertrend sangat tipis (${distAtr.toFixed(2)} ATR), rawan tersapu noise.`,
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

/**
 * Mengevaluasi posisi terbuka berdasarkan data bar harian & Supertrend terbaru
 * untuk menghasilkan rekomendasi tindakan spesifik besok pagi + skor kesehatan.
 */
export function evaluatePosition(
  pos: PositionRow,
  bars: VBar[],
  st: STPoint[]
): PositionAdvice | null {
  if (bars.length === 0 || st.length === 0) return null;

  const lastBar = bars[bars.length - 1];
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : null;
  const lastSt = st[st.length - 1];
  const currentPrice = lastBar.close;
  const dayChangePct =
    prevBar && prevBar.close > 0 ? ((currentPrice - prevBar.close) / prevBar.close) * 100 : 0;

  const holdingBars = Math.max(1, bars.filter((b) => b.date >= pos.buy_date).length);

  const shares = pos.lots * 100;
  const costBasis = pos.buy_price * shares;
  const marketValue = currentPrice * shares;
  const pnlRp = marketValue - costBasis;
  const pnlPct = costBasis > 0 ? ((currentPrice - pos.buy_price) / pos.buy_price) * 100 : 0;

  const isBullish = lastSt.trend === 1;
  const stLine = isBullish ? lastSt.up : lastSt.dn;
  const suggestedSl = isBullish ? floorToIdxTick(lastSt.up, 1) : null;
  const slRiskFromCurrentPct =
    suggestedSl && currentPrice > 0 ? ((suggestedSl - currentPrice) / currentPrice) * 100 : 0;
  const isBreakevenOrBetter =
    (suggestedSl !== null && suggestedSl >= pos.buy_price) ||
    (pos.sl_installed !== null && pos.sl_installed >= pos.buy_price);
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

  const health = computeHealthScore({
    isBullish,
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
    holdingBars,
    currentPrice,
    stLine,
    pnlRp,
    pnlPct,
    marketValue,
    slRiskFromCurrentPct,
    isBreakevenOrBetter,
  };

  // 1. PRIORITAS TERTINGGI: Tren berbalik Bearish atau Close tembus SL terpasang
  if (!isBullish || closeBreachedSl) {
    return {
      ...base,
      code: "EXIT_STOP",
      badge: "JUAL BESOK · Sinyal Keluar",
      badgeCls: "bg-rose-600 text-white",
      borderCls: "border-rose-400",
      headline: "Pasang order jual saat market buka (atau pastikan auto-SL tereksekusi).",
      detail: !isBullish
        ? `Tren Supertrend telah berbalik BEARISH (harga tutup ${fmtRp(currentPrice)} di bawah garis ${fmtRp(stLine)}). Jangan menahan posisi melawan tren.`
        : `Harga penutupan (${fmtRp(currentPrice)}) sudah menyentuh/menembus batas SL terpasang Anda (${fmtRp(pos.sl_installed!)}).`,
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
      detail: `Periksa status auto-order di aplikasi sekuritas Anda. Jika barang sudah terjual otomatis, klik "Catat Jual". Jika belum terjual dan masih dipegang, pastikan SL aktif di ${fmtRp(suggestedSl ?? pos.sl_installed!)}.`,
      suggestedSl,
    };
  }

  // 3. PRIORITAS KETIGA: Garis SL Supertrend naik di atas SL terpasang (atau SL belum dipasang)
  const needsSlUpdate =
    suggestedSl !== null &&
    (pos.sl_installed === null || suggestedSl > pos.sl_installed);

  if (needsSlUpdate && suggestedSl !== null) {
    const isInitial = pos.sl_installed === null;
    const lockedProfitPct = ((suggestedSl - pos.buy_price) / pos.buy_price) * 100;

    return {
      ...base,
      code: "RAISE_SL",
      badge: isInitial ? "PASANG SL AWAL" : "NAIKKAN TRAILING SL",
      badgeCls: "bg-emerald-600 text-white",
      borderCls: "border-emerald-300",
      headline: isInitial
        ? `Pasang auto-order SL di ${fmtRp(suggestedSl)} sebelum bursa buka.`
        : `Geser naik auto-order SL dari ${fmtRp(pos.sl_installed!)} ke ${fmtRp(suggestedSl)}.`,
      detail: isBreakevenOrBetter
        ? `Garis Supertrend naik ke ${fmtRp(stLine)}. Dengan SL baru di ${fmtRp(suggestedSl)} (1 tick di bawah garis), posisi ini sudah mengunci profit minimal +${lockedProfitPct.toFixed(1)}% (zero risk).`
        : `Garis Supertrend naik ke ${fmtRp(stLine)}. Memasang SL di ${fmtRp(suggestedSl)} (1 tick di bawah garis) memangkas risiko rugi menjadi ${lockedProfitPct.toFixed(1)}% dari harga beli.`,
      suggestedSl,
    };
  }

  // 4. PRIORITAS KEEMPAT: SL terpasang terlalu lebar (> -8.2% dari harga beli) sementara garis ST lebih dekat
  if (
    installedSlRiskFromBuyPct !== null &&
    installedSlRiskFromBuyPct < -8.2 &&
    suggestedSl !== null &&
    suggestedSl > pos.sl_installed!
  ) {
    return {
      ...base,
      code: "SL_TOO_WIDE",
      badge: "PERKETAT SL · Risiko > 8%",
      badgeCls: "bg-rose-600 text-white",
      borderCls: "border-rose-300",
      headline: `SL terpasang (${fmtRp(pos.sl_installed!)}) berisiko ${installedSlRiskFromBuyPct.toFixed(1)}% dari harga beli. Naikkan ke ${fmtRp(suggestedSl)}.`,
      detail: `Aturan manajemen risiko membatasi kerugian maksimal di kisaran -8%. Geser SL ke ${fmtRp(suggestedSl)} agar ukuran kerugian tetap terkendali sesuai standar sistem.`,
      suggestedSl,
    };
  }

  // 5. PRIORITAS KELIMA: Lonjakan parabolik / ARA dalam 1 hari atau melesat > 4.2 ATR
  if (dayChangePct >= 12 || (distAtr >= 4.2 && pnlPct >= 15)) {
    const spikeSl =
      todayLowSl > (suggestedSl ?? 0) && todayLowSl < currentPrice ? todayLowSl : tightProfitSl;
    const useSpikeSl = spikeSl > (pos.sl_installed ?? 0) && spikeSl < currentPrice;
    const activeSl = useSpikeSl ? spikeSl : suggestedSl;
    const lockedPct = activeSl ? ((activeSl - pos.buy_price) / pos.buy_price) * 100 : 0;

    return {
      ...base,
      code: "PARABOLIC_SPIKE",
      badge: "LONJAKAN EKSTREM · Amankan Profit",
      badgeCls: "bg-emerald-700 text-white",
      borderCls: "border-emerald-400",
      headline: `Harga melesat +${dayChangePct.toFixed(1)}% hari ini (total +${pnlPct.toFixed(1)}%, jarak ${distAtr.toFixed(1)} ATR). Kunci profit ketat!`,
      detail: useSpikeSl
        ? `Kenaikan vertikal rawan profit-taking mendadak besok pagi. Pertimbangkan TP sebagian (50% lot) atau naikkan SL ketat ke ${fmtRp(spikeSl)} (mengunci +${lockedPct.toFixed(1)}%).`
        : `Kenaikan sudah jauh melampaui rata-rata volatilitas harian (${distAtr.toFixed(1)} ATR). Pertimbangkan merealisasikan sebagian keuntungan saat pembukaan menguat.`,
      suggestedSl: activeSl,
    };
  }

  // 6. PRIORITAS KEENAM: Profit lebar (>= +15% atau > 3.5 ATR) -> Tawarkan kunci profit ketat
  if ((distAtr >= 3.5 && pnlPct >= 12) || pnlPct >= 18) {
    const useTight = tightProfitSl > (suggestedSl ?? 0) && tightProfitSl < currentPrice;
    const activeSl = useTight ? tightProfitSl : suggestedSl;
    const lockedPct = activeSl ? ((activeSl - pos.buy_price) / pos.buy_price) * 100 : 0;

    return {
      ...base,
      code: "EXTENDED_PROFIT",
      badge: "PROFIT LEBAR · Kunci Keuntungan",
      badgeCls: "bg-emerald-700 text-white",
      borderCls: "border-emerald-300",
      headline: `Profit sudah +${pnlPct.toFixed(1)}% (${distAtr.toFixed(1)} ATR di atas garis ST). ${
        useTight
          ? `Opsi SL ketat di Low 3 hari: ${fmtRp(tightProfitSl)} (kunci +${lockedPct.toFixed(1)}%).`
          : "Pertimbangkan TP sebagian atau kawal trailing SL."
      }`,
      detail: `Jarak ke garis Supertrend standar (${fmtRp(suggestedSl ?? stLine)}) cukup jauh (${slRiskFromCurrentPct.toFixed(1)}%). Anda bisa menggeser SL ke bawah Low 3 bar terakhir (${fmtRp(tightProfitSl)}) atau melepas sebagian lot untuk mengamankan keuntungan.`,
      suggestedSl: activeSl,
    };
  }

  // 7. PRIORITAS KETUJUH: Time-Stop (Sudah >= 20 hari bursa tapi stagnan < +4%)
  if (holdingBars >= 20 && pnlPct < 4) {
    return {
      ...base,
      code: "TIME_STOP",
      badge: "EVALUASI TIME-STOP",
      badgeCls: "bg-amber-600 text-white",
      borderCls: "border-amber-300",
      headline: `Sudah dipegang ${holdingBars} hari bursa dengan return ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%. Pertimbangkan jual & rotasi modal.`,
      detail: `Horizon optimal strategi ini adalah 10–20 hari bursa. Jika setelah 20 hari harga belum bergerak signifikan, modal lebih produktif dipindahkan ke kandidat Top Pick (Skor ≥ 86) yang baru.`,
      suggestedSl,
    };
  }

  // 8. PRIORITAS KEDELAPAN: Tekanan koreksi tajam mendekati SL (< 1.5% jarak ke SL)
  const distToActiveSlPct =
    pos.sl_installed && currentPrice > 0
      ? ((currentPrice - pos.sl_installed) / currentPrice) * 100
      : Math.abs(slRiskFromCurrentPct);

  if (dayChangePct <= -3.5 && distToActiveSlPct <= 1.8) {
    return {
      ...base,
      code: "GAP_WARNING",
      badge: "SIAGA · Mepet Batas SL",
      badgeCls: "bg-amber-600 text-white",
      borderCls: "border-amber-300",
      headline: `Turun ${dayChangePct.toFixed(1)}% hari ini; harga hanya terpaut ${distToActiveSlPct.toFixed(1)}% di atas SL (${fmtRp(pos.sl_installed ?? suggestedSl ?? stLine)}).`,
      detail: `Jika besok pagi dibuka gap down di bawah batas SL, pastikan auto-order SL Anda aktif agar tidak terkena slippage lebih dalam.`,
      suggestedSl,
    };
  }

  // 9. PRIORITAS KESEMBILAN: Peringatan dini stagnan (hari ke-13 s/d 19) atau volume distribusi
  if (heavyDistribution || (holdingBars >= 13 && pnlPct <= 1.5)) {
    return {
      ...base,
      code: "WATCH_MOMENTUM",
      badge: heavyDistribution ? "WASPADA DISTRIBUSI" : `PANTAU KETAT · H-${holdingBars}`,
      badgeCls: "bg-amber-500 text-white",
      borderCls: "border-amber-300",
      headline: heavyDistribution
        ? `Muncul candle merah dengan lonjakan volume (>2x rata-rata). Pastikan auto-SL aktif di ${fmtRp(pos.sl_installed ?? suggestedSl ?? stLine)}.`
        : `Sudah ${holdingBars} hari bursa dan harga masih jalan di tempat (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%).`,
      detail: heavyDistribution
        ? `Terjadi tekanan jual besar hari ini. Jangan menambah posisi; biarkan garis SL Supertrend menjaga batas kerugian Anda.`
        : `Mendekati batas evaluasi 20 hari bursa. Jika dalam 3–5 hari ke depan belum mampu menembus naik, bersiaplah melakukan rotasi modal.`,
      suggestedSl,
    };
  }

  // 10. PRIORITAS KESEPULUH: Tren matang (> 25 hari bursa) dalam kondisi profit
  if (holdingBars > 25 && pnlPct >= 4) {
    const useTight = tightProfitSl > (pos.sl_installed ?? 0) && tightProfitSl < currentPrice;
    return {
      ...base,
      code: "MATURE_TREND_PROFIT",
      badge: `TREN MATANG · H-${holdingBars}`,
      badgeCls: "bg-teal-700 text-white",
      borderCls: "border-teal-300",
      headline: `Posisi sudah berjalan ${holdingBars} hari bursa (+${pnlPct.toFixed(1)}%). Kawal ketat sisa tren dengan trailing SL.`,
      detail: useTight
        ? `Durasi pegang sudah melampaui siklus normal 20 hari. Anda bisa menggeser SL ke Low 3 bar (${fmtRp(tightProfitSl)}) agar kenaikan lebih dari 3 minggu tidak berbalik impas.`
        : `Durasi pegang sudah di atas 25 hari bursa. Pertahankan auto-SL di ${fmtRp(pos.sl_installed ?? suggestedSl ?? stLine)} dan hindari menambah lot baru pada tren yang sudah tua.`,
      suggestedSl: useTight ? tightProfitSl : suggestedSl,
    };
  }

  // 11. PRIORITAS KESEBELAS: Kandidat Pyramiding / Add-on (Sudah Zero Risk, tren segar, jarak 0.6–2.0 ATR)
  if (
    isBreakevenOrBetter &&
    pnlPct >= 5 &&
    pnlPct <= 14 &&
    holdingBars >= 3 &&
    holdingBars <= 12 &&
    distAtr >= 0.6 &&
    distAtr <= 2.0 &&
    !heavyDistribution
  ) {
    return {
      ...base,
      code: "PYRAMIDING_READY",
      badge: "ZERO RISK · Peluang Add-On",
      badgeCls: "bg-sky-700 text-white",
      borderCls: "border-sky-300",
      headline: `Modal awal sudah aman (SL di atas harga beli) & tren menguat (+${pnlPct.toFixed(1)}%, jarak ${distAtr.toFixed(1)} ATR).`,
      detail: `Jika slot portofolio masih tersedia dan skor screener emiten ini masih ≥ 86, posisi ini memenuhi syarat untuk pyramiding (tambah muatan kecil) dengan batas SL di ${fmtRp(pos.sl_installed ?? suggestedSl ?? stLine)}.`,
      suggestedSl,
    };
  }

  // 12. PRIORITAS KEDUABELAS: Fase inkubasi awal (Baru pegang 1–3 hari bursa)
  if (holdingBars <= 3) {
    return {
      ...base,
      code: "FRESH_ENTRY_MONITOR",
      badge: `POSISI BARU · H-${holdingBars}`,
      badgeCls: "bg-slate-800 text-white",
      borderCls: "border-emerald-200",
      headline: `Fase awal swing (hari ke-${holdingBars}). Biarkan harga bernapas dengan SL di ${fmtRp(pos.sl_installed ?? suggestedSl ?? stLine)}.`,
      detail: `Pada 1–3 hari pertama setelah beli, wajar jika harga menguji area breakout atau bergerak di sekitar harga beli (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%). Fokus utama hanya memastikan auto-SL sudah aktif di sekuritas.`,
      suggestedSl,
    };
  }

  // 13. KONDISI NORMAL: Tahan posisi (Hold)
  return {
    ...base,
    code: "HOLD",
    badge: "TAHAN POSISI (HOLD)",
    badgeCls: "bg-slate-800 text-white",
    borderCls: "border-emerald-200",
    headline: `Pertahankan posisi & biarkan auto-SL aktif di ${fmtRp(pos.sl_installed ?? suggestedSl ?? stLine)}.`,
    detail: `Tren masih Bullish sehat (usia pegang ${holdingBars} dari target 10–20 hari bursa, jarak ${distAtr.toFixed(1)} ATR di atas garis ST). Belum perlu mengubah order di sekuritas.`,
    suggestedSl,
  };
}

export type PerformanceStats = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  realizedNetRp: number; // total penambahan portofolio bersih dari transaksi selesai
  avgWinPct: number;
  avgLossPct: number;
  avgWinRp: number;
  avgLossRp: number;
  expectancyPct: number; // rata-rata return bersih per transaksi (%)
  expectancyRp: number; // rata-rata penambahan Rp per transaksi
  profitFactor: number | null; // null jika belum pernah loss
  avgHoldDays: number;
  bestTrade: { ticker: string; pnlPct: number; pnlRp: number } | null;
  worstTrade: { ticker: string; pnlPct: number; pnlRp: number } | null;
};

/** Menghitung Win Rate, Expectancy, dan Penambahan Portofolio Bersih dari riwayat transaksi CLOSED */
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
    }

    // Hitung durasi hari kalender beli -> jual
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
    bestTrade,
    worstTrade,
  };
}
// Skor 0-100 untuk saham bullish (swing 1 minggu - 1 bulan). Fungsi murni.
// Varian D (Penalti Moderat — Pemenang Uji Out-of-Sample):
// - Healthy Uptrend Base: di atas EMA50, ret60 >= +8% (0.08), flips60 <= 2
// - Penalti struktural: <EMA50 (×0.88), ret60 <= 0 (×0.92), flips60 >= 4 (×0.93/0.85/0.75), ER30 < 0.18 non-base (×0.90)
import { MIN_AVG_VALUE, WEIGHTS } from "./config";
import type { Metrics } from "./metrics";

export type ScorePart = {
  key: keyof typeof WEIGHTS;
  label: string;
  weight: number;
  fraction: number; // 0..1
  detail: string;
};

export type ScoreResult = {
  eligible: boolean; // lolos filter keras (bullish + likuiditas)
  reason: string | null; // alasan jika tidak lolos
  total: number; // 0..100 (setelah penalti struktural)
  rawTotal: number; // 0..100 (sebelum penalti struktural)
  penaltyMultiplier: number; // 1 = tanpa penalti, < 1 = terkena penalti
  penalties: string[]; // daftar alasan penalti struktural jika ada
  parts: ScorePart[];
};

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const f = (v: number | null, d = 2) => (v === null ? "–" : v.toFixed(d));

// rs = persentil return 60 bar (0..1) terhadap semua emiten; null = tidak diketahui
export function scoreMetrics(m: Metrics, rs: number | null, minValue: number = MIN_AVG_VALUE): ScoreResult {
  const parts: ScorePart[] = [];
  const add = (key: keyof typeof WEIGHTS, label: string, fraction: number, detail: string) =>
    parts.push({ key, label, weight: WEIGHTS[key] ?? 0, fraction: clamp01(fraction), detail });

  // Varian D: Healthy Uptrend Base untuk konsolidasi/retrace sehat dalam uptrend menengah
  // (di atas EMA50, return 60 bar >= +8%, dan tidak sering flip/whipsaw)
  const isHealthyUptrendBase =
    m.aboveEma50 === true &&
    m.ret60 !== null &&
    m.ret60 >= 0.08 &&
    (m.flips60 == null || m.flips60 <= 2);

  // 1) Kedekatan ke garis: 0 di <=0.2 ATR, penuh 0.5-2 ATR, turun ke 0 di 4 ATR
  const d = m.distAtr;
  add(
    "proximity",
    "Kedekatan ke garis",
    d === null ? 0 : Math.min(ramp(d, 0.2, 0.5), 1 - ramp(d, 2, 4)),
    `${f(d)} ATR di atas garis`
  );

  // 2) Risk/reward (bobot 0, tetap dihitung untuk laporan IC backtest)
  add("rr", "Risk/reward", m.rr === null ? 0 : ramp(m.rr, 0, 3), `R:R ${f(m.rr)} (target high 20 hari)`);

  // 3) Kualitas tren + Deteksi Sideways / Whipsaw yang kontekstual
  const ema = m.aboveEma50 === null ? 0.5 : m.aboveEma50 ? 1 : 0;
  const rawAdx = m.adx === null ? 0.5 : ramp(m.adx, 16, 28);
  const adx = m.adx !== null && isHealthyUptrendBase ? Math.max(rawAdx, 0.65) : rawAdx;
  const hl = m.higherLow === null ? 0.5 : m.higherLow ? 1 : 0;

  // Jika sedang retrace/konsolidasi sehat dalam uptrend, ER rendah bukan kelemahan
  const rawEr = m.er30 == null ? null : ramp(m.er30, 0.15, 0.4);
  const er = rawEr === null ? null : isHealthyUptrendBase ? Math.max(rawEr, 0.75) : rawEr;

  const flipScore = m.flips60 == null ? null : 1 - ramp(m.flips60, 2, 5); // <=2 flip = bersih, >=5 flip = choppy

  const trendComponents = [ema, adx, hl];
  if (er !== null) trendComponents.push(er);
  if (flipScore !== null) trendComponents.push(flipScore);
  const trendFraction = trendComponents.reduce((s, v) => s + v, 0) / trendComponents.length;

  const choppyFlags: string[] = [];
  if (m.aboveEma50 === false) choppyFlags.push("di bawah EMA50");
  if (m.flips60 != null && m.flips60 >= 4) choppyFlags.push(`${m.flips60}x flip/60h (whipsaw)`);
  if (m.er30 != null && m.er30 < 0.18 && !isHealthyUptrendBase) {
    choppyFlags.push(`ER ${m.er30.toFixed(2)} (sideways)`);
  }
  if (m.adx !== null && m.adx < 18 && !isHealthyUptrendBase) {
    choppyFlags.push(`ADX lemah (${f(m.adx, 0)})`);
  }

  const baseNote =
    isHealthyUptrendBase && m.er30 != null && m.er30 < 0.18 ? " · konsolidasi dalam uptrend" : "";

  const trendSummary =
    choppyFlags.length > 0
      ? `Waspada sideways: ${choppyFlags.join(", ")}`
      : `${m.aboveEma50 === null ? "EMA50 –" : "di atas EMA50"}, ADX ${f(m.adx, 0)}, ${
          m.higherLow === null ? "HL –" : m.higherLow ? "higher low" : "lower low"
        }${m.flips60 != null ? `, ${m.flips60}x flip` : ""}${baseNote}`;

  add("trendQuality", "Kualitas tren", trendFraction, trendSummary);

  // 4) Umur tren
  const age = m.barsInTrend;
  add("trendAge", "Umur tren", age < 2 ? 0.2 : age < 5 ? 0.6 : age <= 40 ? 1 : 0.6, `${age} bar sejak BUY`);

  // 5) Kedalaman koreksi: skor penuh jika retrace <= 15%, turun ke 0 di 50%
  const r = m.retrace;
  add(
    "pullback",
    "Kedalaman koreksi",
    r === null ? 0 : 1 - ramp(r, 0.15, 0.5),
    `${r === null ? "–" : (r * 100).toFixed(0) + "%"} dari rentang 20 hari`
  );

  // 6) Volume mengering: rasio 5/20 <= 0.8 bagus, >= 1.3 buruk
  add(
    "volume",
    "Volume mengering",
    m.volRatio === null ? 0.5 : 1 - ramp(m.volRatio, 0.8, 1.3),
    `volume 5 hari = ${f(m.volRatio)}x rata-rata 20 hari`
  );

  // 7) Pola candle bullish (bobot 0, tetap dihitung untuk laporan IC backtest)
  const recency = m.patternAge === null ? 0 : [1, 0.6, 0.3][m.patternAge] ?? 0;
  const near = m.distAtr !== null && m.distAtr <= 2.5 ? 1 : 0.4;
  add(
    "candle",
    "Pola candle bullish",
    m.pattern ? recency * near : 0,
    m.pattern ? `${m.pattern} (${m.patternAge === 0 ? "hari ini" : m.patternAge + " hari lalu"})` : "tidak ada"
  );

  // 8) Kekuatan relatif
  add(
    "relStrength",
    "Kekuatan relatif",
    rs === null ? 0.5 : rs,
    rs === null
      ? "belum diketahui"
      : `peringkat ${(rs * 100).toFixed(0)} persentil (return ~3 bulan ${m.ret60 === null ? "–" : (m.ret60 * 100).toFixed(1) + "%"})`
  );

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const rawWeighted = parts.reduce((s, p) => s + p.weight * p.fraction, 0);
  const score = totalWeight > 0 ? (rawWeighted / totalWeight) * 100 : 0;

  // Penalti struktural moderat untuk saham sideways/downtrend (Varian D)
  let structureMultiplier = 1;
  const penalties: string[] = [];

  if (m.aboveEma50 === false) {
    structureMultiplier *= 0.88;
    penalties.push("Di bawah EMA50 (×0.88)");
  }
  if (m.ret60 !== null && m.ret60 <= 0) {
    structureMultiplier *= 0.92;
    penalties.push("Return 60h ≤ 0% (×0.92)");
  }
  if (m.flips60 != null && m.flips60 >= 4) {
    const flipMult = m.flips60 >= 6 ? 0.75 : m.flips60 === 5 ? 0.85 : 0.93;
    structureMultiplier *= flipMult;
    penalties.push(`Whipsaw ${m.flips60}x flip (×${flipMult.toFixed(2)})`);
  }
  if (m.er30 != null && m.er30 < 0.18 && !isHealthyUptrendBase) {
    structureMultiplier *= 0.9;
    penalties.push(`Sideways ER ${m.er30.toFixed(2)} (×0.90)`);
  }

  const rawTotal = Math.round(score);
  const total = Math.round(score * structureMultiplier);

  let reason: string | null = null;
  if (m.trend !== 1) reason = "Tren bearish";
  else if (m.avgValue20 < minValue) reason = "Likuiditas di bawah batas";

  return {
    eligible: reason === null,
    reason,
    total,
    rawTotal,
    penaltyMultiplier: Number(structureMultiplier.toFixed(4)),
    penalties,
    parts,
  };
}

// Persentil (0..1) tiap key; tie diberi peringkat rata-rata. Nilai null diabaikan.
export function percentileMap(items: { key: string; value: number | null }[]): Map<string, number> {
  const vals = items
    .filter((x) => x.value !== null)
    .map((x) => x.value as number)
    .sort((a, b) => a - b);
  const out = new Map<string, number>();
  const n = vals.length;
  if (n === 0) return out;
  for (const it of items) {
    if (it.value === null) continue;
    if (n === 1) {
      out.set(it.key, 0.5);
      continue;
    }
    let less = 0,
      eq = 0;
    for (const v of vals) {
      if (v < it.value) less++;
      else if (v === it.value) eq++;
    }
    out.set(it.key, (less + (eq - 1) / 2) / (n - 1));
  }
  return out;
}
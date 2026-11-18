// Deteksi pola candle BULLISH. Fungsi murni.
// Pola reversal (Hammer, Engulfing, Piercing, Harami, Morning Star) hanya dihitung
// jika harga turun sebelum pola: open bar pertama pola < close 3 bar sebelumnya.
import type { Bar } from "./supertrend";

type OHLC = Pick<Bar, "open" | "high" | "low" | "close">;

export type CandlePattern = { index: number; name: string; short: string };

const body = (b: OHLC) => Math.abs(b.close - b.open);
const range = (b: OHLC) => b.high - b.low;
const bull = (b: OHLC) => b.close > b.open;
const bear = (b: OHLC) => b.close < b.open;
const longBear = (b: OHLC) => bear(b) && range(b) > 0 && body(b) >= 0.5 * range(b);
const longBull = (b: OHLC) => bull(b) && range(b) > 0 && body(b) >= 0.5 * range(b);

function downBefore(bars: OHLC[], start: number): boolean {
  return start >= 3 && bars[start].open < bars[start - 3].close;
}

export function detectBullishPatterns(bars: OHLC[]): CandlePattern[] {
  const out: CandlePattern[] = [];

  for (let i = 0; i < bars.length; i++) {
    const c = bars[i];
    if (range(c) <= 0) continue;
    const p = i >= 1 ? bars[i - 1] : null;
    const a = i >= 2 ? bars[i - 2] : null; // dua bar sebelumnya

    let hit: { name: string; short: string } | null = null;

    // 1) Three White Soldiers
    if (a && p && [a, p, c].every(longBull)) {
      const ok =
        p.close > a.close &&
        c.close > p.close &&
        p.open >= a.open && p.open <= a.close &&
        c.open >= p.open && c.open <= p.close &&
        [a, p, c].every((b) => b.high - b.close <= 0.3 * body(b)) &&
        downBefore(bars, i - 2);
      if (ok) hit = { name: "Three White Soldiers", short: "3WS" };
    }

    // 2) Morning Star
    if (!hit && a && p && longBear(a) && range(p) > 0 && bull(c)) {
      const ok =
        body(p) <= 0.5 * body(a) &&
        p.open <= a.close && p.close <= a.close &&
        c.close > (a.open + a.close) / 2 &&
        downBefore(bars, i - 2);
      if (ok) hit = { name: "Morning Star", short: "M.Star" };
    }

    // 3) Bullish Engulfing
    if (!hit && p && bear(p) && bull(c)) {
      const ok =
        c.open <= p.close && c.close >= p.open && body(c) > body(p) && downBefore(bars, i - 1);
      if (ok) hit = { name: "Bullish Engulfing", short: "Engulf" };
    }

    // 4) Piercing Line
    if (!hit && p && bear(p) && body(p) >= 0.5 * range(p) && bull(c)) {
      const ok =
        c.open <= p.close &&
        c.close > (p.open + p.close) / 2 &&
        c.close < p.open &&
        downBefore(bars, i - 1);
      if (ok) hit = { name: "Piercing Line", short: "Pierce" };
    }

    // 5) Bullish Harami
    if (!hit && p && longBear(p) && bull(c) && body(c) > 0) {
      const ok = c.open >= p.close && c.close <= p.open && body(c) < body(p) && downBefore(bars, i - 1);
      if (ok) hit = { name: "Bullish Harami", short: "Harami" };
    }

    // 6) Hammer (termasuk dragonfly doji): ekor bawah panjang, ekor atas kecil
    if (!hit) {
      const lower = Math.min(c.open, c.close) - c.low;
      const upper = c.high - Math.max(c.open, c.close);
      const ok =
        lower >= 2 * body(c) && lower >= 0.6 * range(c) && upper <= 0.1 * range(c) && downBefore(bars, i);
      if (ok) hit = { name: "Hammer", short: "Hammer" };
    }

    if (hit) out.push({ index: i, ...hit });
  }
  return out;
}

// Terjemahan langsung dari Pine Script "Cek" (Supertrend, TradingView v4).
// Default: ATR period 10, multiplier 3.0, source hl2, ATR = RMA (changeATR = true).

export type Bar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type STPoint = {
  date: string;
  atr: number;
  up: number; // garis support  (Pine: up)
  dn: number; // garis resistance (Pine: dn)
  trend: 1 | -1;
  signal: "BUY" | "SELL" | null;
  prs: number; // (close - garis aktif) / close * 100
};

export function supertrend(bars: Bar[], period = 10, mult = 3): STPoint[] {
  const n = bars.length;
  if (n < period) return [];

  // 1) True Range. Bar pertama: high - low (close[1] belum ada).
  const tr: number[] = bars.map((b, i) =>
    i === 0
      ? b.high - b.low
      : Math.max(
          b.high - b.low,
          Math.abs(b.high - bars[i - 1].close),
          Math.abs(b.low - bars[i - 1].close)
        )
  );

  // 2) ATR = RMA (Wilder), diisi SMA pada bar ke-`period`.
  const atr: number[] = new Array(n).fill(NaN);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += tr[i];
  atr[period - 1] = seed / period;
  for (let i = period; i < n; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }

  // 3-6) Band, ratchet, trend, sinyal.
  const out: STPoint[] = [];
  let prevUp = NaN;
  let prevDn = NaN;
  let trend: 1 | -1 = 1; // Pine: trend = 1 pada bar awal

  for (let i = period - 1; i < n; i++) {
    const b = bars[i];
    const src = (b.high + b.low) / 2; // hl2
    const upRaw = src - mult * atr[i];
    const dnRaw = src + mult * atr[i];

    // nz(up[1], up) : bar pertama memakai nilai mentah sendiri
    const up1 = Number.isNaN(prevUp) ? upRaw : prevUp;
    const dn1 = Number.isNaN(prevDn) ? dnRaw : prevDn;
    const pc = i > 0 ? bars[i - 1].close : b.close; // close[1]

    const up = pc > up1 ? Math.max(upRaw, up1) : upRaw;
    const dn = pc < dn1 ? Math.min(dnRaw, dn1) : dnRaw;

    const before = trend;
    if (trend === -1 && b.close > dn1) trend = 1;
    else if (trend === 1 && b.close < up1) trend = -1;

    const signal: STPoint["signal"] =
      trend !== before ? (trend === 1 ? "BUY" : "SELL") : null;

    const line = trend === 1 ? up : dn;
    out.push({
      date: b.date,
      atr: atr[i],
      up,
      dn,
      trend,
      signal,
      prs: ((b.close - line) / b.close) * 100,
    });

    prevUp = up;
    prevDn = dn;
  }
  return out;
}

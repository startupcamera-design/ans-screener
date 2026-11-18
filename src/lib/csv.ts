// Validasi & normalisasi baris CSV. Fungsi murni (tanpa dependensi) agar mudah diuji.

export const EXPECTED_HEADERS = [
  "Ticker",
  "Date/Time",
  "Open",
  "High",
  "Low",
  "Close",
  "Volume(Unit)",
] as const;

export type PriceRow = {
  ticker: string;
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type RowResult =
  | { status: "ok"; row: PriceRow }
  | { status: "skipped"; reason: string } // mis. saham disuspensi: OHLC kosong
  | { status: "error"; reason: string };

export function normalizeTicker(raw: string): string | null {
  const t = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{0,11}(\.JK)?$/.test(t)) return null;
  return t.endsWith(".JK") ? t : `${t}.JK`;
}

// Menerima: "17/11/2026", "17/11/2026 9:02:00", "2026-11-17", "2026-11-17 00:00:00"
export function parseDate(raw: string): string | null {
  const s = (raw ?? "").trim().split(/[\sT]/)[0];
  let y: number, m: number, d: number;
  let mt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mt) {
    d = +mt[1];
    m = +mt[2];
    y = +mt[3];
  } else if ((mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    y = +mt[1];
    m = +mt[2];
    d = +mt[3];
  } else return null;

  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null; // tanggal tidak nyata (mis. 31/02)
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function num(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

export function validateRow(r: Record<string, unknown>): RowResult {
  const ticker = normalizeTicker(String(r["Ticker"] ?? ""));
  if (!ticker) return { status: "error", reason: `Ticker tidak valid: "${r["Ticker"] ?? ""}"` };

  const date = parseDate(String(r["Date/Time"] ?? ""));
  if (!date) return { status: "error", reason: `Tanggal tidak valid: "${r["Date/Time"] ?? ""}"` };

  const o = num(r["Open"]);
  const h = num(r["High"]);
  const l = num(r["Low"]);
  const c = num(r["Close"]);
  const vRaw = num(r["Volume(Unit)"]);

  // Semua OHLC kosong = tidak ada perdagangan (suspensi). Dilewati, bukan error.
  if (o === null && h === null && l === null && c === null) {
    return { status: "skipped", reason: `${ticker} ${date}: OHLC kosong (dilewati)` };
  }
  if ([o, h, l, c].some((x) => x === null || Number.isNaN(x))) {
    return { status: "error", reason: `${ticker} ${date}: OHLC tidak lengkap/bukan angka` };
  }
  const [O, H, L, C] = [o, h, l, c] as number[];
  if (L <= 0) return { status: "error", reason: `${ticker} ${date}: harga <= 0` };
  if (H < L) return { status: "error", reason: `${ticker} ${date}: High < Low` };
  if (O < L || O > H || C < L || C > H) {
    return { status: "error", reason: `${ticker} ${date}: Open/Close di luar rentang High-Low` };
  }
  const vol = vRaw === null ? 0 : vRaw;
  if (Number.isNaN(vol) || vol < 0) {
    return { status: "error", reason: `${ticker} ${date}: volume tidak valid` };
  }

  return {
    status: "ok",
    row: { ticker, date, open: O, high: H, low: L, close: C, volume: Math.round(vol) },
  };
}

export function checkHeaders(fields: string[] | undefined): string | null {
  const got = (fields ?? []).map((f) => f.replace(/^﻿/, "").trim());
  const missing = EXPECTED_HEADERS.filter((h) => !got.includes(h));
  return missing.length ? `Kolom hilang: ${missing.join(", ")}` : null;
}

// Hapus duplikat (ticker,date) dalam satu batch: Postgres menolak upsert
// yang menyentuh baris yang sama dua kali. Baris terakhir menang.
export function dedupe(rows: PriceRow[]): PriceRow[] {
  const m = new Map<string, PriceRow>();
  for (const r of rows) m.set(`${r.ticker}|${r.date}`, r);
  return [...m.values()];
}

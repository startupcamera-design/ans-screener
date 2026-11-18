import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase-server";
import { supertrend } from "@/lib/supertrend";
import { computeMetrics, VBar } from "@/lib/metrics";
import { ST_MULT, ST_PERIOD } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;

const WINDOW = 400; // jumlah bar historis yang dipakai agar RMA ATR konvergen
const CONCURRENCY = 8;

// POST { offset?: number, limit?: number, keep?: number }
// Memproses `limit` ticker mulai dari `offset`; klien mengulang sampai nextOffset = null.
// `keep` = berapa bar terakhir per ticker yang disimpan ke supertrend_daily.
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const offset = Math.max(0, Number(body.offset) || 0);
  const limit = Math.min(100, Math.max(1, Number(body.limit) || 40));
  const keep = Math.min(400, Math.max(1, Number(body.keep) || 15));

  const db = supabaseAdmin();

  const { data: stocks, count, error: e1 } = await db
    .from("stocks")
    .select("ticker", { count: "exact" })
    .order("ticker")
    .range(offset, offset + limit - 1);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const tickers = (stocks ?? []).map((s) => s.ticker as string);
  const total = count ?? 0;

  const rowsOut: Record<string, unknown>[] = [];
  const metricsOut: Record<string, unknown>[] = [];
  let insufficient = 0;

  async function work(ticker: string) {
    const { data, error } = await db
      .from("prices")
      .select("date,open,high,low,close,volume")
      .eq("ticker", ticker)
      .order("date", { ascending: false })
      .limit(WINDOW);
    if (error) throw new Error(`${ticker}: ${error.message}`);
    const bars: VBar[] = (data ?? [])
      .reverse()
      .map((d: any) => ({
        date: d.date,
        open: +d.open,
        high: +d.high,
        low: +d.low,
        close: +d.close,
        volume: +d.volume,
      }));
    const res = supertrend(bars, ST_PERIOD, ST_MULT);
    if (res.length === 0) {
      insufficient++;
      return;
    }
    const m = computeMetrics(bars, res);
    if (m) {
      metricsOut.push({
        ticker,
        date: bars[bars.length - 1].date,
        dist_atr: rn(m.distAtr, 4),
        rr: rn(m.rr, 4),
        bars_in_trend: m.barsInTrend,
        adx: rn(m.adx, 2),
        above_ema50: m.aboveEma50,
        higher_low: m.higherLow,
        retrace: rn(m.retrace, 4),
        vol_ratio: rn(m.volRatio, 4),
        ret60: rn(m.ret60, 4),
        avg_value20: Math.round(m.avgValue20),
        atr_pct: rn(m.atrPct, 4),
        pattern: m.pattern,
        pattern_age: m.patternAge,
      });
    }
    for (const p of res.slice(-keep)) {
      rowsOut.push({
        ticker,
        date: p.date,
        atr: round(p.atr, 6),
        lower: round(p.up, 4),
        upper: round(p.dn, 4),
        trend: p.trend,
        signal: p.signal,
        prs: round(p.prs, 4),
      });
    }
  }

  try {
    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
      await Promise.all(tickers.slice(i, i + CONCURRENCY).map(work));
    }
    for (let i = 0; i < metricsOut.length; i += 1000) {
      const { error } = await db
        .from("screener_metrics")
        .upsert(metricsOut.slice(i, i + 1000), { onConflict: "ticker" });
      if (error) throw new Error(error.message);
    }
    for (let i = 0; i < rowsOut.length; i += 1000) {
      const { error } = await db
        .from("supertrend_daily")
        .upsert(rowsOut.slice(i, i + 1000), { onConflict: "ticker,date" });
      if (error) throw new Error(error.message);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }

  const next = offset + tickers.length;
  return NextResponse.json({
    processed: tickers.length,
    insufficient, // ticker dengan data < 10 bar (belum bisa dihitung)
    total,
    nextOffset: next < total && tickers.length > 0 ? next : null,
  });
}

function rn(v: number | null, d: number) {
  return v === null ? null : round(v, d);
}

function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

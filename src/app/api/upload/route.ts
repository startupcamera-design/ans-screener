import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase-server";
import { dedupe, PriceRow } from "@/lib/csv";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH = 1000;

function isRow(r: any): r is PriceRow {
  return (
    r &&
    typeof r.ticker === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
    [r.open, r.high, r.low, r.close, r.volume].every((x) => typeof x === "number" && Number.isFinite(x))
  );
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Body harus berisi { rows: [...] }" }, { status: 400 });
  }
  const rows: PriceRow[] = dedupe(body.rows.filter(isRow));
  if (rows.length === 0) return NextResponse.json({ saved: 0 });

  const db = supabaseAdmin();

  // 1) pastikan semua ticker ada di tabel stocks
  const tickers = [...new Set(rows.map((r) => r.ticker))].map((ticker) => ({ ticker }));
  for (let i = 0; i < tickers.length; i += BATCH) {
    const { error } = await db
      .from("stocks")
      .upsert(tickers.slice(i, i + BATCH), { onConflict: "ticker", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: `stocks: ${error.message}` }, { status: 500 });
  }

  // 2) upsert harga per 1000 baris
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from("prices")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "ticker,date" });
    if (error) return NextResponse.json({ error: `prices: ${error.message}` }, { status: 500 });
  }

  // 3) catat log (dikirim klien pada batch terakhir tiap file)
  if (body.log && typeof body.log === "object") {
    const l = body.log;
    await db.from("upload_logs").insert({
      filename: String(l.filename ?? ""),
      rows_total: Number(l.rows_total) || 0,
      rows_ok: Number(l.rows_ok) || 0,
      rows_failed: Number(l.rows_failed) || 0,
      date_min: l.date_min ?? null,
      date_max: l.date_max ?? null,
    });
  }

  return NextResponse.json({ saved: rows.length });
}

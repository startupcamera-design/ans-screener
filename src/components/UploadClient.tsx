"use client";

import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { checkHeaders, dedupe, PriceRow, validateRow } from "@/lib/csv";

const CHUNK = 3000; // baris per request ke /api/upload

export default function UploadClient() {
  const db = supabaseBrowser();
  const [email, setEmail] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [authErr, setAuthErr] = useState<string | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [rebuild, setRebuild] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    db.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data: sub } = db.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, [db]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const say = (m: string) => setLog((l) => [...l, m]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr(null);
    const { error } = await db.auth.signInWithPassword({ email: loginEmail, password: loginPass });
    if (error) setAuthErr(error.message);
  }

  async function token(): Promise<string> {
    const { data } = await db.auth.getSession();
    if (!data.session) throw new Error("Sesi login berakhir, silakan login ulang.");
    return data.session.access_token;
  }

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json;
  }

  function parseFile(file: File) {
    return new Promise<Papa.ParseResult<Record<string, string>>>((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.replace(/^﻿/, "").trim(),
        complete: resolve,
        error: reject,
      });
    });
  }

  async function run() {
    if (files.length === 0) return;
    setBusy(true);
    setLog([]);
    setProgress(0);
    let totalSaved = 0;

    try {
      // ---- 1) Parse + validasi + simpan, file demi file
      const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
      for (let fi = 0; fi < sorted.length; fi++) {
        const f = sorted[fi];
        const parsed = await parseFile(f);
        const hdr = checkHeaders(parsed.meta.fields);
        if (hdr) {
          say(`✗ ${f.name}: ${hdr}. File dilewati.`);
          continue;
        }

        const ok: PriceRow[] = [];
        let skipped = 0, errors = 0;
        const errSample: string[] = [];
        for (const rec of parsed.data) {
          const r = validateRow(rec);
          if (r.status === "ok") ok.push(r.row);
          else if (r.status === "skipped") skipped++;
          else {
            errors++;
            if (errSample.length < 5) errSample.push(r.reason);
          }
        }
        const rows = dedupe(ok);
        const dates = rows.map((r) => r.date).sort();
        say(
          `${f.name}: ${parsed.data.length} baris → ${rows.length} valid, ${skipped} dilewati (OHLC kosong), ${errors} error`
        );
        errSample.forEach((m) => say(`   ! ${m}`));

        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          const last = i + CHUNK >= rows.length;
          const res = await post("/api/upload", {
            rows: chunk,
            log: last
              ? {
                  filename: f.name,
                  rows_total: parsed.data.length,
                  rows_ok: rows.length,
                  rows_failed: errors,
                  date_min: dates[0] ?? null,
                  date_max: dates[dates.length - 1] ?? null,
                }
              : undefined,
          });
          totalSaved += res.saved ?? 0;
        }
        setProgress(((fi + 1) / sorted.length) * 50);
      }
      say(`✓ Tersimpan ${totalSaved} baris harga.`);

      // ---- 2) Hitung ulang Supertrend, bertahap
      say(`Menghitung Supertrend (${rebuild ? "rebuild riwayat 120 bar" : "15 bar terakhir"})…`);
      let offset: number | null = 0;
      let insufficient = 0;
      while (offset !== null) {
        const res: any = await post("/api/recompute", { offset, limit: 40, keep: rebuild ? 120 : 15 });
        insufficient += res.insufficient ?? 0;
        offset = res.nextOffset;
        const done = offset === null ? res.total : offset;
        setProgress(50 + (res.total ? (done / res.total) * 50 : 50));
      }
      say(`✓ Selesai.${insufficient ? ` ${insufficient} ticker punya <10 bar sehingga belum dihitung.` : ""}`);
      setProgress(100);
    } catch (e: any) {
      say(`✗ Gagal: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  if (email === null) {
    return (
      <form onSubmit={login} className="mx-auto max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-bold">Login admin</h1>
        <input type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Email" className={inputCls} />
        <input type="password" required value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="Password" className={inputCls} />
        {authErr && <p className="text-sm text-rose-600">{authErr}</p>}
        <button className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800">Masuk</button>
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Upload data harian</h1>
        <button onClick={() => db.auth.signOut()} className="text-sm text-slate-500 hover:text-slate-800">
          Keluar ({email})
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Format kolom: <code className="rounded bg-slate-100 px-1">Ticker, Date/Time, Open, High, Low, Close, Volume(Unit)</code>.
        Tanggal <code className="rounded bg-slate-100 px-1">dd/mm/yyyy</code> atau <code className="rounded bg-slate-100 px-1">yyyy-mm-dd</code>.
        Ticker otomatis menjadi <code className="rounded bg-slate-100 px-1">XXXX.JK</code>. Anda boleh memilih banyak file sekaligus;
        mengunggah ulang data yang sama aman (di-upsert).
      </div>

      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center hover:border-emerald-500">
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          disabled={busy}
          className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <div className="text-slate-700">
          {files.length ? `${files.length} file dipilih` : "Klik untuk memilih file CSV (boleh banyak)"}
        </div>
        {files.length > 0 && (
          <div className="mt-2 text-xs text-slate-500">
            {files.slice(0, 5).map((f) => f.name).join(", ")}
            {files.length > 5 ? ` … +${files.length - 5}` : ""}
          </div>
        )}
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={rebuild} onChange={(e) => setRebuild(e.target.checked)} disabled={busy} />
        Rebuild riwayat Supertrend 120 bar (centang untuk backfill awal; tidak perlu untuk upload harian)
      </label>

      <button
        onClick={run}
        disabled={busy || files.length === 0}
        className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Memproses…" : "Upload & hitung Supertrend"}
      </button>

      {(busy || log.length > 0) && (
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div ref={logRef} className="max-h-72 overflow-y-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";

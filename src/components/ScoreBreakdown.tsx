import type { ScoreResult } from "@/lib/scoring";

/**
 * Pewarnaan skor selaras dengan hasil backtest Scoring v2 (ATR 10, Mult 1.5):
 * - >= 86 : Elite Top Pick (Top ~4% bursa — rata-rata +2.90% / 10h)
 * - 71-85 : Kuat · Q5 (Kuintil teratas / Top 20% — rata-rata +1.25% / 10h)
 * - 57-70 : Cukup · Q4 (Menengah atas)
 * - < 57  : Lemah / Sideways · Q1-Q3 (Hindari)
 */
export function scoreTone(total: number) {
  if (total >= 86) return "bg-emerald-600 text-white shadow-sm";
  if (total >= 71) return "bg-emerald-100 text-emerald-800";
  if (total >= 57) return "bg-amber-100 text-amber-800";
  return "bg-rose-50 text-rose-700";
}

function scoreVerdict(total: number) {
  if (total >= 86) {
    return {
      badge: "Elite Top Pick · Top ~4%",
      cls: "bg-emerald-50 text-emerald-900 border-emerald-200",
      desc: "Kandidat prioritas utama (backtest +2.90% / 10h, win rate 51.6%). Layak langsung dieksekusi jika risiko SL ≤ 8% dan tidak gap up > 1,5%.",
    };
  }
  if (total >= 71) {
    return {
      badge: "Kuat · Q5 (Top 20%)",
      cls: "bg-teal-50/70 text-teal-900 border-teal-200",
      desc: "Masuk kuintil teratas bursa (backtest +1.25% / 10h). Layak dipertimbangkan sebagai alternatif jika kandidat skor ≥ 86 sedang kosong.",
    };
  }
  if (total >= 57) {
    return {
      badge: "Cukup · Q4",
      cls: "bg-amber-50/70 text-amber-900 border-amber-200",
      desc: "Struktur tren cukup baik namun momentum belum optimal. Sebaiknya tunggu konsolidasi lebih rapi atau pilih skor ≥ 71.",
    };
  }
  return {
    badge: "Lemah / Sideways · Q1–Q3",
    cls: "bg-rose-50/70 text-rose-800 border-rose-200",
    desc: "Terkena penalti struktur tren atau momentum lemah (rata-rata return negatif pada backtest). Hindari untuk posisi baru.",
  };
}

export default function ScoreBreakdown({ result }: { result: ScoreResult }) {
  if (!result.eligible) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="text-sm font-semibold text-slate-700">Skor setup</h2>
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2.5 text-slate-600">
          Tidak diberi skor: <b>{result.reason}</b>. Skor hanya dihitung untuk saham bullish dengan likuiditas ≥ batas minimal.
        </p>
      </div>
    );
  }

  const verdict = scoreVerdict(result.total);

  // Pisahkan faktor aktif (weight > 0) dan urutkan dari bobot terbesar
  const activeParts = result.parts
    .filter((p) => p.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const infoParts = result.parts.filter((p) => p.weight === 0);

  // Hitung skor mentah sebelum penalti struktural (anti-sideways / di bawah EMA50 / ret60 <= 0)
  const totalWeight = activeParts.reduce((s, p) => s + p.weight, 0);
  const rawScore =
    totalWeight > 0
      ? Math.round((activeParts.reduce((s, p) => s + p.weight * p.fraction, 0) / totalWeight) * 100)
      : result.total;
  const penaltyPoints = Math.max(0, rawScore - result.total);

  const trendPart = activeParts.find((p) => p.key === "trendQuality");
  const isSidewaysWarning = trendPart?.detail.startsWith("Waspada sideways:") ?? false;

  // Ringkasan cepat faktor terkuat & catatan terlemah
  const sortedByScoreRatio = [...activeParts].sort((a, b) => b.fraction - a.fraction);
  const strongest = sortedByScoreRatio[0];
  const weakest = sortedByScoreRatio[sortedByScoreRatio.length - 1];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Skor setup</h2>
          <span className="mt-0.5 inline-block text-xs font-medium text-slate-500">
            {verdict.badge}
          </span>
        </div>
        <span className={`rounded-full px-3.5 py-1 text-lg font-bold tabular-nums ${scoreTone(result.total)}`}>
          {result.total}
          <span className="text-xs font-normal opacity-80"> / 100</span>
        </span>
      </div>

      {/* Ringkasan keputusan + highlight faktor utama */}
      <div className={`mt-3 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${verdict.cls}`}>
        <p>{verdict.desc}</p>
        {strongest && weakest && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-black/5 pt-1.5 text-[11px] opacity-90">
            <span>
              Unggul di: <b>{strongest.label}</b> ({Math.round(strongest.fraction * 100)}%)
            </span>
            {weakest.fraction < 0.7 && (
              <span>
                · Terlemah: <b>{weakest.label}</b> ({Math.round(weakest.fraction * 100)}%)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Keterangan penalti jika struktur tren terdeteksi sideways / whipsaw / di bawah EMA50 */}
      {penaltyPoints > 0 && (
        <div className="mt-2.5 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-800">
          <div className="font-semibold">
            Penalti Struktur Tren: -{penaltyPoints} poin{" "}
            <span className="font-normal text-rose-700">(skor mentah {rawScore} → {result.total})</span>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-rose-700">
            {isSidewaysWarning
              ? trendPart?.detail
              : "Terkena pengali penalti struktur (di bawah EMA 50, frekuensi flip tinggi, ER rendah, atau return 3 bulan ≤ 0) sehingga tidak masuk Top Pick."}
          </p>
        </div>
      )}

      {/* Rincian faktor aktif */}
      <ul className="mt-4 space-y-3">
        {activeParts.map((p) => {
          const earned = p.weight * p.fraction;
          const pct = Math.round(p.fraction * 100);
          const barColor =
            pct >= 75 ? "bg-emerald-500" : pct >= 45 ? "bg-amber-400" : "bg-rose-400";
          const isWarnDetail = p.detail.startsWith("Waspada sideways:");

          return (
            <li key={p.key}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-slate-700">{p.label}</span>
                <span className="tabular-nums text-slate-600">
                  <b>{earned.toFixed(1)}</b>
                  <span className="text-slate-400"> / {p.weight}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <div className={`mt-0.5 text-[11px] ${isWarnDetail ? "font-medium text-rose-600" : "text-slate-500"}`}>
                {p.detail}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Catatan faktor non-aktif (bobot 0) sebagai referensi visual saja */}
      {infoParts.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Info tambahan (bobot 0)
          </div>
          <div className="mt-1.5 space-y-1 text-xs text-slate-500">
            {infoParts.map((p) => (
              <div key={p.key} className="flex justify-between gap-2">
                <span>{p.label}:</span>
                <span className="text-right font-medium text-slate-600">{p.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
import type { VBar } from "./metrics";

// Gabungkan bar harian menjadi mingguan (minggu mulai Senin; label = tanggal Senin).
export function toWeekly(bars: VBar[]): VBar[] {
  const weeks = new Map<string, VBar>();
  for (const b of bars) {
    const [y, m, d] = b.date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); // mundur ke Senin
    const key = dt.toISOString().slice(0, 10);
    const w = weeks.get(key);
    if (!w) {
      weeks.set(key, { ...b, date: key });
    } else {
      w.high = Math.max(w.high, b.high);
      w.low = Math.min(w.low, b.low);
      w.close = b.close;
      w.volume += b.volume;
    }
  }
  return [...weeks.values()].sort((a, b) => a.date.localeCompare(b.date));
}

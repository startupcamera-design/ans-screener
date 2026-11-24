import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const csvDir = process.argv[2] || "./data-csv";

const modes = [
  { id: "eod_hybrid", name: "SL-3: Hybrid (Juara Sebelumnya)" },
  { id: "atr_chandelier", name: "SL-4: Chandelier ATR (2.5x/3.0x)" },
  { id: "early_be6", name: "SL-5: Hybrid + Early BE (+6%)" },
  { id: "ratchet_lock", name: "SL-6: Hybrid + Ratchet (+6/12/20%)" },
  { id: "two_day_flip", name: "SL-7: Hybrid + 2-Day Flip Confirm" },
];

const grab = (txt, re) => (txt.match(re) || ["", "–"])[1].replace(/\*/g, "").trim();

const rows = modes.map((m) => {
  const dir = `backtest-sl-${m.id}`;
  console.error(`Menjalankan ${m.name}...`);
  execSync(`npx tsx scripts/backtest-sop.ts "${csvDir}" --sl-mode ${m.id} --out "${dir}"`, {
    stdio: "ignore",
  });
  const md = readFileSync(`${dir}/sop-report.md`, "utf8");
  return {
    "Model SL": m.name,
    "Modal Akhir": grab(md, /Modal Akhir:\*\* (.*?) \(/),
    "Total Return": grab(md, /Total Pertumbuhan Modal:\*\* (.*?) \(/),
    CAGR: grab(md, /CAGR\):\*\* (.*?) \//),
    "Max DD": grab(md, /Max Drawdown.*?\*\* (.*)/),
    "Win Rate": grab(md, /Win Rate:\*\* (.*)/),
    "Profit Factor": grab(md, /Profit Factor:\*\* (.*)/),
    "Avg Win": grab(md, /Avg Win\):\*\* (.*)/),
    "Avg Loss": grab(md, /Avg Loss\):\*\* (.*)/),
    Expectancy: grab(md, /Expectancy\):\*\* (.*)/),
  };
});

console.table(rows);
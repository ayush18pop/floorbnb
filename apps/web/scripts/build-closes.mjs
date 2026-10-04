// Builds data/closes.json: daily closes since 2018 for the assets the vault can hold that have history.
// Source: research/m_study/data/ohlc_*.csv (Yahoo daily OHLC, git-ignored there; fetched by research/m_study/fetch_data.py).
// Usage: node scripts/build-closes.mjs <dir with ohlc_NVDA.csv ohlc_QQQ.csv ohlc_SPY.csv>
import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2];
const map = { NVDAB: "NVDA", QQQB: "QQQ", SPYB: "SPY" };
const cols = {};
for (const [sym, t] of Object.entries(map)) {
  const rows = readFileSync(`${dir}/ohlc_${t}.csv`, "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
  cols[sym] = new Map(rows.filter((r) => r[0] >= "2018-01-01" && Number(r[4]) > 0).map((r) => [r[0], Number(r[4])]));
}
const dates = [...cols.NVDAB.keys()].filter((d) => Object.values(cols).every((m) => m.has(d))).sort();
const out = { source: "Yahoo daily closes via research/m_study/fetch_data.py; NVDA, QQQ, SPY stand in for NVDAB, QQQB, SPYB (the bStock tracks the stock; token vs stock gap not modelled)", from: dates[0], to: dates.at(-1), dates, closes: Object.fromEntries(Object.keys(map).map((s) => [s, dates.map((d) => Math.round(cols[s].get(d) * 1e4) / 1e4)])) };
writeFileSync(new URL("../data/closes.json", import.meta.url), JSON.stringify(out));
console.log(out.from, out.to, dates.length);

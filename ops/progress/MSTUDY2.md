# MSTUDY2 progress (floor range and term length)

Status: done, branch agent/MSTUDY2. Deliverable: research/m_study2/REPORT.md (summary, recommendation, public numbers,
contract acceptance table + formula, charts, caveats). Reproduce: research/m_study2/run_all.sh.

Key results: slider 80 to 95 (backtested from 80 to 98), presets 1 mo / 3 mo / 6 mo / 1 yr, default 1 yr / 90%; 1 wk and
2 wk not recommended; upside kept = about 4 x (100 - floor); contract rejection driven only by minTrade
(BadFloor unreachable); 365-day term uncreatable after 2026-12-17 (holiday horizon + 14 days).
Claims to change are listed in REPORT.md section 8 (no CONTEXT.md/site edits made here).

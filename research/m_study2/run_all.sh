#!/usr/bin/env bash
# Reproduce the floor/term study (about 6 minutes on 12 cores). Run from research/m_study2.
set -e
uv venv .venv && uv pip install --python .venv/bin/python pandas numpy yfinance matplotlib scipy
mkdir -p results charts data
.venv/bin/python fetch_data.py          # ~3 min, daily OHLC -> data/ (gitignored)
.venv/bin/python check_sim.py           # cppi2 == m_study/sim.cppi
for t in 7 14 30 90 180 365; do .venv/bin/python run_grid.py $t & done; wait
.venv/bin/python ana.py                 # S1, S2 (with CIs)
.venv/bin/python start_dates.py         # S3, S4
.venv/bin/python small_deposits.py      # S5
.venv/bin/python stress_counts.py       # S6
.venv/bin/python make_tables.py         # P1 (median CIs)
.venv/bin/python contract_accept.py     # A1, A2 (+ asserts vs contract tests)
.venv/bin/python md_tables.py && .venv/bin/python md_accept.py
.venv/bin/python charts.py && .venv/bin/python build_report.py

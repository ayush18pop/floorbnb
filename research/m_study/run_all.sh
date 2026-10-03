#!/usr/bin/env bash
# Reproduce everything (about 10 minutes total on 12 cores). Run from research/m_study.
set -e
uv venv .venv && uv pip install --python .venv/bin/python pandas numpy yfinance matplotlib scikit-learn scipy
mkdir -p results charts data
.venv/bin/python fetch_data.py      # ~3 min, yfinance daily OHLC -> data/ (gitignored)
.venv/bin/python study_hist.py      # ~1 min  -> data/hist_windows.csv.gz
.venv/bin/python ana_hist.py        # T0-T6
.venv/bin/python oos.py             # T7
.venv/bin/python dial.py            # T8
.venv/bin/python mc.py              # MC1-MC3 (~3 min)
.venv/bin/python dyn.py             # T9, T10 (~3 min)
.venv/bin/python ml.py              # T11, T12 (~2 min)
.venv/bin/python charts.py          # charts/

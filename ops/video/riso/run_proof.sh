#!/usr/bin/env bash
# Full proof pipeline: assets -> 300-frame riso render (4 workers) -> cues.json -> mp4 -> QA.
set -euo pipefail
V="$(cd "$(dirname "$0")/.." && pwd)"
cd "$V/riso"
[ -d node_modules/@fontsource/anton ] || npm install --no-audit --no-fund @fontsource/anton @fontsource/instrument-serif
node assets.mjs
python3 render.py --capture "$V/proof/capture" --out "$V/proof/render" --workers 4
mkdir -p "$V/out"
ffmpeg -y -loglevel error -framerate 30 -i "$V/proof/render/r_%04d.png" -frames:v 300 -c:v libx264 -preset slow -crf 14 \
  -pix_fmt yuv420p -r 30 -an -movflags +faststart "$V/out/floor_proof_10s_silent.mp4"
python3 qa.py
ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=width,height,r_frame_rate,nb_read_frames,pix_fmt,codec_name -show_entries format=duration -of compact "$V/out/floor_proof_10s_silent.mp4"

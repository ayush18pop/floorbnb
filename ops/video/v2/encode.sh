#!/bin/bash
cd /home/user/floorbnb/ops/video
ffmpeg -y -loglevel error -framerate 30 -i v2/render/r_%04d.png -c:v libx264 -preset medium -crf 14 -pix_fmt yuv420p -r 30 -movflags +faststart out/floor_v2_60s_silent.mp4
ffmpeg -y -loglevel error -i out/floor_v2_60s_silent.mp4 -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -movflags +faststart out/floor_v2_60s_preview.mp4
echo ENC_DONE

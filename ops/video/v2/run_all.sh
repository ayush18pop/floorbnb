#!/bin/bash
# restartable: comp.py skips valid frames. Re-run this script after any restart.
cd /home/user/floorbnb/ops/video/v2
python3 comp.py --frames 0-1799 --out render --workers 4 >> render_log.txt 2>&1
python3 comp.py --plan cut15 --frames 0-439 --out render15 --workers 4 >> render15_log.txt 2>&1

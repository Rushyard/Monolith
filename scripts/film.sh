#!/usr/bin/env bash
# Prepare a generated clip for a page film (app/public/films/<name>.mp4):
#   1080p H.264, no audio, faststart. With --loop, the last second cross-fades
#   into the first one so the loop has no visible seam.
# Usage: npm run film -- path/to/clip.mp4 <vault|auditor|stargate|…> [--loop]
set -euo pipefail
in="${1:?usage: npm run film -- clip.mp4 name [--loop]}"
name="${2:?usage: npm run film -- clip.mp4 name [--loop]}"
out="$(dirname "$0")/../app/public/films"
mkdir -p "$out"
scale="scale=-2:'min(1080,ih)'"
if [[ "${3:-}" == "--loop" ]]; then
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
  vf="[0:v]split[a][b];[a]trim=start=1,setpts=PTS-STARTPTS[body];[b]trim=0:1,setpts=PTS-STARTPTS[head];\
[body][head]xfade=transition=fade:duration=1:offset=$(echo "$d - 2" | bc),$scale,format=yuv420p[v]"
  ffmpeg -y -loglevel error -i "$in" -an -filter_complex "$vf" -map "[v]" \
    -c:v libx264 -preset slow -crf 26 -movflags +faststart "$out/$name.mp4"
else
  ffmpeg -y -loglevel error -i "$in" -an -vf "$scale" \
    -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart "$out/$name.mp4"
fi
ls -lh "$out/$name.mp4"

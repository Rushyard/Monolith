#!/usr/bin/env bash
# Prepare a generated clip (e.g. Veo) for the home hero:
#   1080p H.264, no audio, faststart (plays while downloading), + a poster from the last frame.
# Usage: npm run hero:video -- path/to/clip.mp4
set -euo pipefail
in="${1:?usage: npm run hero:video -- path/to/clip.mp4}"
out="$(dirname "$0")/../app/public/hero"
mkdir -p "$out"
ffmpeg -y -loglevel error -i "$in" -an -vf "scale=-2:'min(1080,ih)'" \
  -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart "$out/monolith.mp4"
ffmpeg -y -loglevel error -sseof -0.1 -i "$out/monolith.mp4" -frames:v 1 -q:v 3 "$out/monolith-poster.jpg"
ls -lh "$out"

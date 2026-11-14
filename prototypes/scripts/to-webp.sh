#!/bin/sh
# Convert game textures (basecolor/normal/roughness .png) under the given folders
# to .webp next to them and delete the .png. Games load the .webp files.
# The texture labs write PNGs; run this on the copy you put in a prototype's public/.
#   sh scripts/to-webp.sh e11-combat/public/tex/biomes
set -e
for dir in "$@"; do
  find "$dir" \( -name basecolor.png -o -name normal.png -o -name roughness.png \) | while read -r f; do
    cwebp -quiet -q 90 -m 6 "$f" -o "${f%.png}.webp" && rm "$f"
  done
done

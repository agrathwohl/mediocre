#!/usr/bin/env bash
# FluidSynth batch renderer with glob/directory support
# Usage: ./fluidsynth-render.sh input.mid [output_dir]
#        ./fluidsynth-render.sh "*.mid" [output_dir]
#        ./fluidsynth-render.sh /path/to/midi/directory [output_dir]

set -e

TIMIDITY_CFG="/home/gwohl/code/mediocre-unfucked/timidity-sanitized.cfg"
SF_DIR="/home/gwohl/code/mediocre/soundfonts/500-soundfonts-full-gm-sets"

if [[ -z "$1" ]]; then
    echo "Usage: $0 <midi_file|glob_pattern|directory> [output_dir]"
    echo ""
    echo "Examples:"
    echo "  $0 song.mid"
    echo "  $0 '*.mid'"
    echo "  $0 './output/*jazz*.mid' ./rendered/"
    echo "  $0 ./output/ ./rendered/"
    exit 1
fi

INPUT="$1"
OUTPUT_DIR="${2:-.}"
PLAYLIST=()

if [[ -d "$INPUT" ]]; then
    while IFS= read -r -d '' file; do
        PLAYLIST+=("$file")
    done < <(find "$INPUT" -maxdepth 1 -name "*.mid" -type f -print0 | sort -z)
elif [[ -f "$INPUT" ]]; then
    PLAYLIST+=("$INPUT")
else
    while IFS= read -r -d '' file; do
        PLAYLIST+=("$file")
    done < <(compgen -G "$INPUT" | sort | tr '\n' '\0')
    
    if [[ ${#PLAYLIST[@]} -eq 0 ]]; then
        for f in $INPUT; do
            [[ -f "$f" ]] && PLAYLIST+=("$f")
        done
    fi
fi

if [[ ${#PLAYLIST[@]} -eq 0 ]]; then
    echo "ERROR: No MIDI files found matching: $INPUT"
    exit 1
fi

[[ ! -d "$OUTPUT_DIR" ]] && mkdir -p "$OUTPUT_DIR"

SOUNDFONTS=()
while IFS= read -r line; do
    if [[ "$line" =~ ^soundfont[[:space:]]+\"(.+)\"$ ]]; then
        sf_file="${BASH_REMATCH[1]}"
        sf_path="$SF_DIR/$sf_file"
        if [[ -f "$sf_path" ]]; then
            SOUNDFONTS+=("$sf_path")
        fi
    fi
done < "$TIMIDITY_CFG"

echo "Loaded ${#SOUNDFONTS[@]} soundfonts"
echo "Rendering ${#PLAYLIST[@]} files to: $OUTPUT_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CURRENT=0
FAILED=0

for midi_file in "${PLAYLIST[@]}"; do
    ((CURRENT++))
    basename_noext=$(basename "${midi_file%.mid}")
    output_wav="$OUTPUT_DIR/${basename_noext}.wav"
    
    echo "[$CURRENT/${#PLAYLIST[@]}] $(basename "$midi_file")"
    
    if fluidsynth -ni \
        -F "$output_wav" \
        -r 48000 \
        -o synth.polyphony=512 \
        -o synth.gain=1.0 \
        -o synth.reverb.active=1 \
        -o synth.reverb.room-size=0.6 \
        -o synth.reverb.damp=0.4 \
        -o synth.reverb.width=0.5 \
        -o synth.reverb.level=0.9 \
        -o synth.chorus.active=1 \
        -o synth.chorus.nr=3 \
        -o synth.chorus.level=2.0 \
        -o synth.chorus.speed=0.3 \
        -o synth.chorus.depth=8.0 \
        "${SOUNDFONTS[@]}" \
        "$midi_file" 2>/dev/null; then
        echo "  ✓ $output_wav"
    else
        echo "  ✗ FAILED"
        ((FAILED++))
    fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Complete: $((CURRENT - FAILED))/${#PLAYLIST[@]} succeeded"
[[ $FAILED -gt 0 ]] && echo "Failed: $FAILED"

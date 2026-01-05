#!/usr/bin/env bash
# FluidSynth realtime player with playlist support
# Usage: ./fluidsynth-play.sh input.mid
#        ./fluidsynth-play.sh "*.mid"
#        ./fluidsynth-play.sh /path/to/midi/directory
#
# Controls during playback:
#   n/N/Right - Next track
#   p/P/Left  - Previous track  
#   q/Q       - Quit
#   r/R       - Restart current track
#   l/L       - List playlist

set -e

TIMIDITY_CFG="/home/gwohl/code/mediocre-unfucked/timidity-sanitized.cfg"
SF_DIR="/home/gwohl/code/mediocre/soundfonts/500-soundfonts-full-gm-sets"

if [[ -z "$1" ]]; then
    echo "Usage: $0 <midi_file|glob_pattern|directory>"
    echo ""
    echo "Examples:"
    echo "  $0 song.mid"
    echo "  $0 '*.mid'"
    echo "  $0 './output/*jazz*.mid'"
    echo "  $0 ./output/"
    echo ""
    echo "Controls: n=next, p=prev, r=restart, l=list, q=quit"
    exit 1
fi

INPUT="$1"
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
echo "Playlist: ${#PLAYLIST[@]} tracks"
echo ""
echo "Controls: [n]ext [p]rev [r]estart [l]ist [q]uit"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CURRENT_INDEX=0
FLUIDSYNTH_PID=""
ACTION="play"

cleanup() {
    [[ -n "$FLUIDSYNTH_PID" ]] && kill "$FLUIDSYNTH_PID" 2>/dev/null || true
    stty sane 2>/dev/null || true
    echo ""
    echo "Goodbye!"
    exit 0
}

trap cleanup EXIT INT TERM

list_playlist() {
    echo ""
    echo "━━━ PLAYLIST ━━━"
    for i in "${!PLAYLIST[@]}"; do
        if [[ $i -eq $CURRENT_INDEX ]]; then
            echo "▶ $((i+1)). $(basename "${PLAYLIST[$i]}")"
        else
            echo "  $((i+1)). $(basename "${PLAYLIST[$i]}")"
        fi
    done
    echo "━━━━━━━━━━━━━━━━"
    echo ""
}

play_current() {
    [[ -n "$FLUIDSYNTH_PID" ]] && kill "$FLUIDSYNTH_PID" 2>/dev/null || true
    sleep 0.1
    
    local track="${PLAYLIST[$CURRENT_INDEX]}"
    echo ""
    echo "[$((CURRENT_INDEX+1))/${#PLAYLIST[@]}] $(basename "$track")"
    
    fluidsynth -a pulseaudio \
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
        "$track" &
    FLUIDSYNTH_PID=$!
}

next_track() {
    if [[ $CURRENT_INDEX -lt $((${#PLAYLIST[@]} - 1)) ]]; then
        ((CURRENT_INDEX++))
        echo "⏭ Next"
        play_current
    else
        echo "⏹ End of playlist"
    fi
}

prev_track() {
    if [[ $CURRENT_INDEX -gt 0 ]]; then
        ((CURRENT_INDEX--))
        echo "⏮ Previous"
        play_current
    else
        echo "⏹ Start of playlist"
    fi
}

play_current

while true; do
    if ! kill -0 "$FLUIDSYNTH_PID" 2>/dev/null; then
        if [[ $CURRENT_INDEX -lt $((${#PLAYLIST[@]} - 1)) ]]; then
            ((CURRENT_INDEX++))
            play_current
        else
            echo "✓ Playlist complete"
            exit 0
        fi
    fi
    
    read -t 0.5 -n 1 key 2>/dev/null || true
    
    case "$key" in
        n|N) next_track ;;
        p|P) prev_track ;;
        r|R) echo "⟳ Restart"; play_current ;;
        l|L) list_playlist ;;
        q|Q) exit 0 ;;
    esac
done

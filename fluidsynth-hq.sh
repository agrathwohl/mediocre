#!/usr/bin/env bash
# FluidSynth - maximum fidelity, RT kernel + RME card
# SF2 ordering matches timidity-sanitized.cfg exactly (last = highest priority)
#
# Usage:
#   ./fluidsynth-hq.sh                    # interactive shell
#   ./fluidsynth-hq.sh file.mid           # play MIDI file
#   ./fluidsynth-hq.sh file.mid out.wav   # render to WAV (offline, no audio device)

SF=/home/gwohl/code/mediocre/soundfonts/500-soundfonts-full-gm-sets

MIDI_FILE="${1:-}"
WAV_OUT="${2:-}"

# Parse soundfont lines from a timidity cfg file.
# Handles: dir directives, soundfont "name.sf2", skips comments.
# Outputs one absolute SF2 path per line, in config order (last = highest priority).
parse_timidity_cfg() {
    local cfg="$1"
    local sf_dir=""
    local re_dir='^dir[[:space:]]+(.+)$'
    local re_sf='^soundfont[[:space:]]+"([^"]+)"'
    while IFS= read -r line; do
        # strip leading whitespace
        line="${line#"${line%%[![:space:]]*}"}"
        # skip blank lines and comments
        [[ -z "$line" || "$line" == \#* ]] && continue
        # dir directive - update search path
        if [[ "$line" =~ $re_dir ]]; then
            sf_dir="${BASH_REMATCH[1]}"
            sf_dir="${sf_dir%"${sf_dir##*[![:space:]]}"}"  # rtrim
            continue
        fi
        # soundfont directive - extract quoted filename
        if [[ "$line" =~ $re_sf ]]; then
            local fname="${BASH_REMATCH[1]}"
            if [[ -n "$sf_dir" ]]; then
                echo "$sf_dir/$fname"
            else
                echo "$fname"
            fi
        fi
    done < "$cfg"
}

# Default SF2 list - same order as timidity-sanitized.cfg, last entry = highest priority
DEFAULT_SOUNDFONTS=(
    # BASE LAYER
    "$SF/GeneralUser GS v1.471.sf2"
    "$SF/FluidR3 GM + GS.sf2"
    "$SF/Phoenix GS GM2 (02-11-2021 Update).sf2"
    "$SF/Phoenix XG.sf2"
    "$SF/Yamaha S-YXG50_0.2.1.2.sf2"
    "$SF/GM SFX Bank.sf2"
    "$SF/SGM-128 v1.17.sf2"
    # SYNTHS & ELECTRONIC
    "$SF/FMSynthesis1.40.sf2"
    "$SF/OPL-3_FM_128M.sf2"
    "$SF/RetroHybrid_V1.1.sf2"
    "$SF/FatBoy-v0.786.sf2"
    # DRUMS
    "$SF/Drums_68_Slingerland_gmremap.sf2"
    "$SF/Drums_Linndrum.sf2"
    "$SF/Drums_TamaRockSTAR.sf2"
    "$SF/Drums_Alex_GM_old_drumkits.sf2"
    "$SF/Drums_GiantSoundfontDrumKit3.9 GM-GS.sf2"
    "$SF/Drums_GiantSoundfontDrumKit2.0XG.sf2"
    # GUITARS & BASS
    "$SF/Guitar_Electric_JNv4.4.sf2"
    "$SF/Guitar_Electric_Guitars_GM.sf2"
    "$SF/Guitar_for_Metal_GM.sf2"
    "$SF/Bass_Janszens_Ibanez_Picked.sf2"
    # ETHNIC & WORLD
    "$SF/Bennetng_8850Asia_Ethnic.sf2"
    # CHIPTUNE
    "$SF/Chiptune_Soundfont_3.0.sf2"
    # ORCHESTRAL
    "$SF/Timbres of Heaven GM_GS_XG_SFX V 3.4 Final.sf2"
    "$SF/Timbres of Heaven (XGM) 4.00(G).sf2"
    "$SF/HQ Orchestral Soundfont Collection v3.0.sf2"
    # HARDWARE EMULATION
    "$SF/SC-55 24-bit XGD Edition.sf2"
    "$SF/SC-55 Roland SOUNDCanvas Up.sf2"
    "$SF/Roland JV-1010.sf2"
    "$SF/Edirol_SD-20_Contemporary.sf2"
    # PREMIUM PIANO
    "$SF/Piano_Z-Doc Soundfont IV.sf2"
    # PREMIUM GM
    "$SF/Airfont_380_Final.sf2"
    "$SF/SGMv2.01-YamahaGrand-Guit-Bass-v2.7.sf2"
    "$SF/Concert GM 0.97 (Test 3).sf2"
    "$SF/HedsoundGMTfix.sf2"
    "$SF/TrianGMGS.sf2"
    "$SF/Compifont_13082016.sf2"
    # GIANTS - highest priority melodic
    "$SF/Orpheus_18.06.2020.sf2"
    "$SF/CrisisGeneralMidi3.01.sf2"
    # DRUM GAP FILLER - highest priority drums
    "$SF/Lil'Sness (V1.00).sf2"
    # ABSOLUTE TOP
    "$SF/Musica 1.7.sf2"
)

# Use companion .timidity.cfg soundfonts if present, otherwise fall back to defaults.
# Checks two candidate names in priority order:
#   1. <basename>.timidity.cfg         (exact match)
#   2. <basename-minus-trailing-1>.timidity.cfg  (e.g. midi=name-13301.mid -> name-1330.timidity.cfg)
find_companion_cfg() {
    local midi="$1"
    local base="${midi%.*}"
    local candidates=(
        "${base}.timidity.cfg"
        "${base%_1}.timidity.cfg"
        "${base%1}.timidity.cfg"
    )
    for c in "${candidates[@]}"; do
        if [[ -f "$c" ]]; then
            echo "$c"
            return
        fi
    done
}

if [[ -n "$MIDI_FILE" ]]; then
    companion="$(find_companion_cfg "$MIDI_FILE")"
    #if [[ -n "$companion" ]]; then
    #    echo "Using per-file soundfont config: $companion" >&2
    #    mapfile -t SOUNDFONTS < <(parse_timidity_cfg "$companion")
    #else
        SOUNDFONTS=("${DEFAULT_SOUNDFONTS[@]}")
    #fi
else
    SOUNDFONTS=("${DEFAULT_SOUNDFONTS[@]}")
fi

# Shared synth quality flags
SYNTH_FLAGS=(
    # Match JACK sample rate
    -o synth.sample-rate=48000
    # Polyphony - high for complex MIDI
    -o synth.polyphony=512
    # Use all CPU cores for synthesis
    -o synth.cpu-cores="$(nproc)"
    # Reverb/chorus OFF - high-quality SF2s have room characteristics baked in;
    # stacking FluidSynth's software effects on top adds mud, not fidelity
    -o synth.reverb.active=0
    -o synth.chorus.active=0
    # Voice overflow priorities - favor percussion and long-held notes
    -o synth.overflow.percussion=4000
    -o synth.overflow.sustained=600
    -o synth.overflow.released=-2000
    -o synth.overflow.age=1000
    -o synth.overflow.volume=500
    # Gain
    -o synth.gain=0.8
    # Thread-safe API
    -o synth.threadsafe-api=1
)

if [ -n "$WAV_OUT" ]; then
    # Offline render to WAV - no audio device, no RT constraints
    # 32-bit float WAV for maximum dynamic range
    exec fluidsynth \
        --audio-driver=file \
        -o audio.file.name="$WAV_OUT" \
        -o audio.file.type=wav \
        -o audio.file.format=s32 \
        -o player.reset-synth=0 \
        "${SYNTH_FLAGS[@]}" \
        --quiet \
        --no-shell \
        "${SOUNDFONTS[@]}" \
        "$MIDI_FILE"

elif [ -n "$MIDI_FILE" ]; then
  echo "WHAT THE FUCK IS WRONG WITH YOU STUPID NIGGER!!!!!!!!
    exec fluidsynth \
        --audio-driver=jack \
        -o audio.jack.id=fluidsynth \
        -o audio.jack.autoconnect=1 \
        -o audio.realtime-prio=95 \
        -o midi.realtime-prio=95 \
        "${SYNTH_FLAGS[@]}" \
        --no-shell \
        "${SOUNDFONTS[@]}" \
        "$MIDI_FILE"
  "
    # Live playback - connect into running JACK session (inherits period size + sample rate)
    exec fluidsynth \
        --audio-driver=jack \
        -o audio.jack.id=fluidsynth \
        -o audio.jack.autoconnect=1 \
        -o audio.realtime-prio=95 \
        -o midi.realtime-prio=95 \
        "${SYNTH_FLAGS[@]}" \
        --no-shell \
        "${SOUNDFONTS[@]}" \
        "$MIDI_FILE"

else
    # Interactive shell mode
    exec fluidsynth \
        --audio-driver=jack \
        -o audio.jack.id=fluidsynth \
        -o audio.jack.autoconnect=1 \
        -o audio.realtime-prio=95 \
        -o midi.realtime-prio=95 \
        "${SYNTH_FLAGS[@]}" \
        "${SOUNDFONTS[@]}"
fi

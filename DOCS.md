<div align="center">

# MEDIOCRE-MUSIC

**Genre-bending AI music composition toolkit** for LLM training dataset creation.

![](./screenshot.png)

[![npm version](https://img.shields.io/npm/v/mediocre-music.svg?style=flat-square)](https://www.npmjs.com/package/mediocre-music)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square)](https://nodejs.org)

</div>

> Create intricate, nuanced, and musically-sophisticated audio using our unique approach to LLM prompting for musical generation. Perfect for training LLM models on audio processing tasks like mixing, de-verbing, and effects processing.

## Listen to Examples

**[Browse the full composition gallery →](https://agrathwohl.github.io/mediocre/)**

The documentation site features playable audio, PDF scores, section navigation, and detailed analysis for every published composition.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Core Commands](#core-commands)
  - [Generate Compositions](#generate-compositions)
  - [Modify Compositions](#modify-compositions)
  - [Enhance Compositions](#enhance-compositions)
  - [Combine Compositions](#combine-compositions)
  - [Validate ABC Notation](#validate-abc-notation)
  - [Sanitize Drums](#sanitize-drums)
  - [More Like This](#more-like-this)
  - [Mix and Match](#mix-and-match)
  - [Add Lyrics](#add-lyrics)
- [Multi-Agent Composition Pipeline](#multi-agent-composition-pipeline)
- [Human-in-the-Loop Control](#human-in-the-loop-control)
- [Choreography System](#choreography-system)
  - [Generate Choreography](#generate-choreography)
  - [Play Choreography](#play-choreography)
- [Advanced Features](#advanced-features)
  - [Sequential Enhancement Mode](#sequential-enhancement-mode)
  - [Streaming Mode](#streaming-mode)
  - [Title Uniqueness Protection](#title-uniqueness-protection)
  - [ABC Validation Pipeline](#abc-validation-pipeline)
- [Publishing Pipeline](#publishing-pipeline)
- [Documentation Site](#documentation-site)
- [TiMidity Configuration](#timidity-configuration)
- [Hybrid Genre System](#hybrid-genre-system)
- [Additional Commands](#additional-commands)
- [Architecture Documentation](#architecture-documentation)
- [CLI Reference](#cli-reference)
- [Tips & Best Practices](#tips--best-practices)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **Multi-Agent AI Pipeline** - 10+ specialized agents (composition, QA, orchestrator, soundfont, drum arranger, genre research, ornamentation, MIDI expression, description, title) coordinated via AI SDK v6
- **Structured Output** - Composition agent uses `Output.object()` with Zod schemas to generate structured components, deterministically assembled into valid ABC notation — eliminates formatting errors
- **Genre Fusion** - Combine classical and modern elements into unique hybrids with genre research agent providing authentic fusion context
- **Human-in-the-Loop Control** - `--interactive` flag enables gate-based supervision of the orchestrator loop with approve/reject/direct/listen/compare/branch actions
- **QA Scoring** - QA agent evaluates every iteration across 5 dimensions: technical, musical, fusion, completeness, duration
- **Orchestrator-Driven Enhancement** - `--sequential` mode generates a foundation then iteratively enhances via specialized worker agents (composition, ornamentation, MIDI expression)
- **Session Persistence** - Orchestration sessions auto-save and can be resumed with `mediocre resume`
- **Checkpointing & Branching** - Every iteration saves a checkpoint; branch from any point to explore alternatives
- **Drum Arrangement** - Dedicated drum arranger agent prescribes GM percussion kits with note mappings per genre
- **ASCII Art Choreography** - Generate and play synchronized visual animations with iterative improvement
- **Title Uniqueness** - Automatic protection against duplicate composition titles via title agent
- **Format Conversion** - ABC → MIDI → WAV → WebM pipeline with PDF scores
- **ABC Validation** - Automatic syntax cleaning, segfault prevention, and 3-pass error correction
- **Audio Processing** - Apply reverb, delay, distortion and more
- **Dataset Building** - Create structured datasets for ML training
- **Interactive TUI** - Browse compositions with playback and rating system
- **Publishing Pipeline** - Automated asset generation for documentation site
- **Section Extraction** - Automatic timeline markers from ABC section comments

---

## Installation

### Quick Start (CLI)

```bash
# Global installation
npm install mediocre-music -g

# Set your API key
export ANTHROPIC_API_KEY=your_key_here
```

### Development Setup

```bash
# Clone and setup
git clone https://github.com/yourusername/mediocre.git
cd mediocre
npm install

# Create .env with your API key
echo "ANTHROPIC_API_KEY=your_key_here" > .env
```

---

## Requirements

### Node.js

- Node.js 18+ (required)

### API Keys

- `ANTHROPIC_API_KEY` - Claude Sonnet 4 (required for generation)

### Why Claude Sonnet 4?

This project uses **Claude Sonnet 4** (`claude-sonnet-4-6`) via the Vercel AI SDK v6 (`@ai-sdk/anthropic`). The model is configured in `src/utils/llm-client.js`. Each agent in the multi-agent pipeline can select its own model — most use Sonnet 4 for generation quality.

**Claude Sonnet 4 excels at:**

- Generating syntactically correct ABC notation with proper header sequences
- Understanding musical structure, voice leading, and harmonic relationships
- Producing creative genre fusion that respects both classical and modern traditions
- Working within abc2midi's extension syntax (%%MIDI commands, multi-voice arrangements)
- Generating structured output via Zod schemas (Output.object() mode)
- Thinking compositionally rather than just textually

### External Tools

| Tool          | Purpose                    | Installation                                           |
| ------------- | -------------------------- | ------------------------------------------------------ |
| `abcmidi`     | ABC ↔ MIDI conversion     | `apt install abcmidi` / `brew install abcmidi`         |
| `abcm2ps`     | ABC → PostScript           | `apt install abcm2ps` / `brew install abcm2ps`         |
| `ghostscript` | PostScript → PDF           | `apt install ghostscript` / `brew install ghostscript` |
| `timidity`    | MIDI → WAV synthesis       | `apt install timidity` / `brew install timidity`       |
| `fluidsynth`  | Alternative MIDI synthesis | `apt install fluidsynth` / `brew install fluidsynth`   |
| `sox`         | Audio effects processing   | `apt install sox` / `brew install sox`                 |
| `ffmpeg`      | WAV → WebM encoding        | `apt install ffmpeg` / `brew install ffmpeg`           |

### NixOS

For NixOS users, you can use a shell with all dependencies:

```bash
nix-shell -p abcmidi abcm2ps ghostscript timidity fluidsynth sox ffmpeg
```

---

## Quick Start

```bash
# Generate something actually interesting
mediocre generate \
  -s "Alien Transmission From a Dying Star" \
  -C "stockhausen,xenakis,ligeti,spectralism,musique concrete" \
  -M "autechre,aphex twin,boards of canada,tim hecker" \
  --producer "Brian Eno" \
  --record-label "Warp" \
  --sequential --stream-text

# Or go full chaos mode
mediocre generate \
  -C "serialism,webern,babbitt,total serialism,darmstadt" \
  -M "venetian snares,igorrr,speedcore,breakcore,merzbow" \
  -c 5 \
  --producer "Arca" \
  --record-label "PAN" \
  --solo \
  --sequential --stream-text

# Interactive enhancement with human-in-the-loop control
mediocre generate \
  -g "Spectralism_x_Footwork" \
  --sequential --interactive --max-iterations 10

# Validate and convert
mediocre validate-abc -i output/*.abc
mediocre convert --to wav -d ./output

# Publish to documentation site
npm run publish:composition
```

---

## Core Commands

### Generate Compositions

Create new compositions from hybrid genre specifications with full creative control.

```bash
# FULL POWER: Massive genre fusion with producer/label aesthetics
mediocre generate \
  -s "Experimental Freak-Out From Another Planet" \
  -C "wagner,mahler,messiaen,babbitt,webern,serialism,xenakis,john cage,julius eastman,futurism,harry partch,musique concrete" \
  -M "eugene chadbourne,fred frith,speedcore,venetian snares,ornette coleman,autechre,lightning bolt,merzbow,math rock,zach hill,sunn o)))" \
  -c 8 \
  --producer "A.G. Cook" \
  --record-label "Hyperdub" \
  --sequential --stream-text

# Hyperpop meets 20th century classical
mediocre generate \
  -s "Deconstructed Club Symphony" \
  -C "stockhausen,ligeti,penderecki,spectralism,prepared piano" \
  -M "sophie,arca,pc music,100 gecs,bladee,drain gang" \
  --producer "Danny L Harle" \
  --record-label "PC Music" \
  --instruments "Synthesizer,Prepared Piano,808,Strings" \
  --sequential --stream-text

# Noise/drone with classical gravitas
mediocre generate \
  -s "Cathedral of Feedback" \
  -C "bruckner,messiaen,arvo part,gregorian chant,organum" \
  -M "sunn o))),boris,earth,tim hecker,fennesz,william basinski" \
  --producer "Steve Albini" \
  --record-label "Southern Lord" \
  --solo \
  --sequential --stream-text

# Math rock meets serialist complexity
mediocre generate \
  -g "Serialist_x_Math_Rock" \
  --producer "Steve Albini" \
  --instruments "Guitar,Bass,Drums,Vibraphone" \
  --solo \
  --sequential --stream-text

# Simple hybrid with creative naming
mediocre generate -g "Baroque_x_Footwork" --creative-names -c 3

# Custom prompts for full control
mediocre generate -g "Opera_x_Noise" \
  --system-prompt examples/custom-system-prompt.txt \
  --user-prompt examples/noise-opera-instructions.txt
```

**All Generate Flags:**

| Flag               | Description                                                             |
| ------------------ | ----------------------------------------------------------------------- |
| `-g, --genre`      | Hybrid genre name (e.g., "Baroque_x_Techno")                            |
| `-s, --style`      | Custom style/vibe description for the composition                       |
| `-C, --classical`  | Comma-separated classical influences (composers, movements, techniques) |
| `-M, --modern`     | Comma-separated modern influences (artists, genres, scenes)             |
| `-c, --count`      | Number of compositions to generate                                      |
| `--producer`       | Make it sound like this producer made it                                |
| `--record-label`   | Make it sound like it was released on this label                        |
| `--instruments`    | Force specific instruments in the output                                |
| `--solo`           | Include a virtuosic solo section                                        |
| `--creative-names` | Generate wild genre names instead of "X_x_Y" format                     |
| `--system-prompt`  | Custom system prompt file                                               |
| `--user-prompt`    | Custom user prompt file                                                 |
| `--sequential`     | Enable orchestrator-driven iterative enhancement                        |
| `--max-iterations` | Maximum enhancement iterations (default: 10)                            |
| `--interactive`    | Enable human-in-the-loop interactive mode with gate controls            |
| `--no-object`      | Use text output instead of structured object mode                       |
| `--soundfonts`     | Use LLM-powered soundfont selection (experimental)                      |
| `--stream-text`    | Use streaming API (prevents timeouts)                                   |
| `--no-midi`        | Skip MIDI conversion                                                    |

### Modify Compositions

Transform or extend existing compositions with full creative control.

```bash
# Add a producer's signature sound
mediocre modify "output/serialist_x_breakcore-*.abc" \
  -i "Add a breakdown that sounds like it was produced by Arca - glitchy, detuned, alien" \
  --producer "Arca" \
  --sequential --stream-text

# Extend with specific instrumentation
mediocre modify "composition.abc" \
  -i "Add a 32-bar prepared piano solo in the style of John Cage, then bring back all instruments for a massive climax" \
  --instruments "Prepared Piano,Strings,Percussion" \
  --solo \
  --sequential --stream-text

# Transform the vibe entirely
mediocre modify "baroque_piece.abc" \
  -i "Make it sound like a lost recording from a 1970s Italian horror film soundtrack" \
  --producer "Goblin" \
  --record-label "Cinevox" \
  --sequential --stream-text

# Instructions from file for complex modifications
mediocre modify "piece.abc" \
  -f instructions/add-microtonal-section.txt \
  --sequential --stream-text
```

**All Modify Flags:**

| Flag                      | Description                                 |
| ------------------------- | ------------------------------------------- |
| `-i, --instructions`      | Text instructions for modification          |
| `-f, --instructions-file` | File containing modification instructions   |
| `--producer`              | Apply producer's aesthetic to modifications |
| `--record-label`          | Apply label's sonic identity                |
| `--instruments`           | Constrain to specific instruments           |
| `--solo`                  | Add a solo section                          |
| `--sequential`            | Enable validation loop                      |
| `--stream-text`           | Use streaming API                           |

### Enhance Compositions

Enhance existing compositions using the multi-agent orchestrator loop. The orchestrator analyzes the composition, decides which worker agent to invoke (composition, ornamentation, or MIDI expression), and iterates until quality thresholds are met.

```bash
# Enhance with orchestrated multi-agent improvement
mediocre enhance "output/baroque_x_trap-*.abc" --max-iterations 5

# Interactive enhancement with human gates at every step
mediocre enhance "output/composition.abc" --interactive --max-iterations 10
```

**All Enhance Flags:**

| Flag               | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `--max-iterations` | Maximum enhancement iterations (default: 10)         |
| `--interactive`    | Enable human-in-the-loop interactive mode            |
| `-o, --output`     | Output directory                                     |

### Combine Compositions

Merge multiple compositions with intelligent integration.

```bash
# Combine with date and genre filtering
mediocre combine \
  -g "serialist,noise,experimental" \
  -f 2024-01-01 \
  -l 120 \
  --producer "Rashad Becker" \
  --record-label "PAN" \
  --sequential --stream-text

# Force specific instrumentation in the combined piece
mediocre combine \
  -f "drone_piece.abc" "breakcore_piece.abc" "orchestral_piece.abc" \
  --instruments "Synthesizer,Orchestra,Breakbeats" \
  --producer "Oneohtrix Point Never" \
  --sequential --stream-text

# Combine recent pieces under 60 seconds
mediocre combine \
  -l 60 \
  -f 2024-06-01 \
  --solo \
  --sequential --stream-text
```

**All Combine Flags:**

| Flag                   | Description                               |
| ---------------------- | ----------------------------------------- |
| `-f, --files`          | Specific ABC files to combine             |
| `-g, --genres`         | Filter by genres (comma-separated)        |
| `-l, --duration-limit` | Max duration in seconds for source pieces |
| `-f, --date-from`      | Filter pieces created after this date     |
| `-t, --date-to`        | Filter pieces created before this date    |
| `-d, --directory`      | Directory to search for compositions      |
| `--producer`           | Apply producer aesthetic                  |
| `--record-label`       | Apply label aesthetic                     |
| `--instruments`        | Force specific instruments                |
| `--solo`               | Include solo section                      |
| `--sequential`         | Enable validation loop                    |
| `--stream-text`        | Use streaming API                         |

### Validate ABC Notation

Validate and fix ABC notation files to prevent synthesis errors.

```bash
# Validate single file
mediocre validate-abc -i "/path/to/composition.abc"

# Validate with output to new file
mediocre validate-abc -i "/path/to/composition.abc" -o "/path/to/fixed.abc"

# Validate all ABC files in output directory
mediocre validate-abc
```

The validator:

- Checks for required headers (X:, T:, M:, L:, K:)
- Ensures blank lines between header and body
- Removes problematic characters that cause abc2midi segfaults
- Tests compilation with abc2midi

### Sanitize Drums

Remap problematic percussion notes to safe alternatives.

```bash
# Basic sanitization with standard remapping
mediocre sanitize "output/composition.abc"

# Preview what would change without modifying
mediocre sanitize "output/composition.abc" --dry-run

# LLM-powered intelligent replacement (for non-standard drum programs)
mediocre sanitize "output/composition.abc" --llm
```

**What gets remapped:**

| Banned Note             | Replacement              | Reason                 |
| ----------------------- | ------------------------ | ---------------------- |
| Note 71 (Whistle)       | Note 45 (Low Tom)        | Harsh, piercing sound  |
| Note 62 (Mute Hi Conga) | Note 47 (Low-Mid Tom)    | Poor soundfont samples |
| Note 63 (Open Hi Conga) | Note 48 (Hi-Mid Tom)     | Inconsistent rendering |
| Note 73 (Short Guiro)   | Note 50 (High Tom)       | Glitchy artifacts      |
| Note 74 (Long Guiro)    | Note 43 (High Floor Tom) | Rendering issues       |
| Note 78 (Mute Cuica)    | Note 41 (Low Floor Tom)  | Unpleasant timbre      |
| Note 79 (Open Cuica)    | Note 45 (Low Tom)        | Unreliable synthesis   |

**Flags:**

| Flag        | Description                                          |
| ----------- | ---------------------------------------------------- |
| `--dry-run` | Preview changes without modifying files              |
| `--llm`     | Use Claude for intelligent context-aware replacement |

### More Like This

Generate compositions similar to an existing piece.

```bash
# Create variations on an existing composition
mediocre more-like-this "output/serialist_x_noise-masterpiece.abc" -c 3

# With producer/label aesthetic applied to variations
mediocre more-like-this "output/baroque_x_footwork.abc" \
  -c 5 \
  --producer "Flying Lotus" \
  --record-label "Brainfeeder" \
  --solo

# Apply a different style to variations
mediocre more-like-this "output/impressionist_x_ambient.abc" \
  -s "Darker, more industrial" \
  --creative-names
```

### Mix and Match

Combine elements from multiple compositions into something new.

```bash
# Basic mix and match
mediocre mix-and-match \
  -f "output/piece1.abc" "output/piece2.abc" "output/piece3.abc"

# With specific instrumentation and production
mediocre mix-and-match \
  -f "baroque.abc" "noise.abc" "ambient.abc" \
  --instruments "Harpsichord,Synthesizer,Feedback,Strings" \
  --producer "Ben Frost" \
  --record-label "Mute" \
  --solo
```

### Add Lyrics

Add vocal parts to existing compositions.

```bash
# Basic lyrics addition
mediocre lyrics \
  -m "output/composition.mid" \
  -a "output/composition.abc" \
  -p "A song about algorithmic entropy and digital decay"

# With full production control
mediocre lyrics \
  -m "output/opera_x_hyperpop.mid" \
  -a "output/opera_x_hyperpop.abc" \
  -p "An aria about parasocial relationships and internet fame" \
  --producer "SOPHIE" \
  --record-label "Transgressive" \
  --instruments "Voice,Synthesizer,808,Strings"
```

---

## Multi-Agent Composition Pipeline

The generation pipeline is built on AI SDK v6 with 10+ specialized agents coordinating to produce compositions:

### Agent Architecture

| Agent | Role | Output Mode |
| ----- | ---- | ----------- |
| **Genre Research** | Researches classical + modern genre characteristics for authentic fusion | Text |
| **Drum Arranger** | Prescribes GM drum kit with note mappings and patterns per genre | Structured (`Output.object()`) |
| **Composition** | Generates structured ABC components (headers, MIDI extensions, voices) | Structured (`Output.object()`) |
| **QA** | Scores iterations across 5 dimensions with categorized issues | Structured (`Output.object()`) |
| **Orchestrator** | Decides which worker agent to invoke next during enhancement | Structured (`Output.object()`) |
| **Soundfont** | Selects optimal soundfont stack for genre fusion | Structured (`Output.object()`) |
| **Description** | Analyzes composition, generates metadata | Text |
| **Title** | Ensures unique title via collision checking | Text |
| **Ornamentation** | Adds stylistically appropriate ornaments (worker) | Text (ABC) |
| **MIDI Expression** | Adds dynamics, expression, MIDI directives (worker) | Text (ABC) |
| **TiMidity Config** | Generates optimized TiMidity config | Text |

### Generation Pipeline (Object Mode)

The composition agent uses `Output.object()` with Zod schemas to generate structured components. These are then deterministically assembled into valid ABC notation by `assembleAbcNotation()` — no LLM formatting errors possible.

```
CLI → Genre Research → Drum Arrangement → Composition Agent (structured output)
  → assembleAbcNotation() → Percussion Safety Net → 3-Pass Error Correction
  → Validation → File Output → Description Agent (parallel)
```

When `--sequential` is passed, the pipeline continues into the enhancement loop:

```
Foundation ABC → Orchestrator decides next action →
  ├── "invoke composition" → Composition agent (structural changes)
  ├── "invoke ornamentation" → Ornamentation agent (embellishments)
  ├── "invoke midi-expression" → MIDI Expression agent (dynamics)
  └── "done" → Stop enhancement
  → QA Agent scores iteration → Loop until quality threshold or max iterations
```

See [docs/COMPOSITION_WORKFLOW_OBJECT_MODE.md](docs/COMPOSITION_WORKFLOW_OBJECT_MODE.md) for the complete 25-step pipeline reference with data shapes at each stage.

### Architecture Diagrams

Visual diagrams of the pipeline are available in `docs/diagrams/`:

- **[Main Pipeline](docs/diagrams/main-pipeline.png)** — End-to-end generation pipeline
- **[Agent Communication](docs/diagrams/agent-communication.png)** — Agent interaction and delegation patterns
- **[Orchestrator Loop](docs/diagrams/orchestrator-loop.png)** — Enhancement loop with gate integration
- **[Data Flow](docs/diagrams/data-flow.png)** — Data shapes at each pipeline stage

---

## Human-in-the-Loop Control

The `--interactive` flag enables human supervision of the orchestrator enhancement loop. Instead of running autonomously, the system pauses at key gate points for human input.

### Gate Points

Gates fire at four points during enhancement:

1. **After orchestrator decision** — See what the orchestrator wants to do next
2. **After agent output** — Review the new ABC and QA scores
3. **When orchestrator says "done"** — Approve completion or force more iterations
4. **When max iterations reached** — Accept result or extend

### Gate Actions

| Key | Action | Effect |
| --- | ------ | ------ |
| `a` | Approve | Continue to next step |
| `r` | Reject | Discard this iteration, re-run with same directive |
| `d` | Direct | Inject a musical directive (free text fed to orchestrator) |
| `l` | Listen | Preview current ABC as audio (abc2midi → timidity) |
| `c` | Compare | A/B listen: previous iteration vs current |
| `+`/`-` | Extend | Increase/decrease remaining iterations |
| `q` | Quit | Stop orchestration, keep best iteration |

### Session Persistence

Sessions auto-save on quit. Resume with:

```bash
mediocre resume output/session.json --max-iterations 5
```

### Checkpointing & Branching

Every iteration saves a checkpoint `.abc` file. Branch from any point:

```bash
# List checkpoints
mediocre checkpoints output/baroque_x_trap-*/

# Create a branch from iteration 3
mediocre branch output/composition.abc --from 3

# Compare two iterations
mediocre compare output/composition_iter2.abc output/composition_iter5.abc
```

---

## Choreography System

### Generate Choreography

Create animated ASCII art choreography synchronized to your music. The system supports iterative improvement - running the command multiple times on the same piece will progressively enhance the choreography.

```bash
# Generate initial choreography (v1.1 schema)
mediocre generate-choreography \
  --abc "output/baroque_x_techno-score1.abc" \
  --desc "A fusion of baroque counterpoint and techno rhythms" \
  --output ./output \
  --verbose

# Run again to improve sparse sections
mediocre generate-choreography \
  --abc "output/baroque_x_techno-score1.abc" \
  --output ./output

# Each run finds the weakest (sparsest) section and adds more events
# v1.1 → v2 → v3 → v4 (iterative improvement)
```

**How Iterative Improvement Works:**

1. **First Run**: Generates `composition-choreography.v1.1.json` with initial choreography
2. **Subsequent Runs**:
   - Detects latest version (v1.1, v2, v3, etc.)
   - Analyzes timeline to find sparsest 60-second section
   - Generates improved events for that section only
   - Merges improvements back into full timeline
   - Saves as next version (v2, v3, v4...)

This section-based approach solves token budget issues with long compositions by improving one chunk at a time.

**Choreography Options:**

| Flag          | Description                                         |
| ------------- | --------------------------------------------------- |
| `--abc`       | Path to ABC notation file (required)                |
| `--desc`      | Text description file path for choreography context |
| `-d, --description` | Inline description text                      |
| `-o, --output` | Output directory (default: ./output)              |
| `-v, --verbose` | Show detailed generation progress                 |

### Play Choreography

Play your audio with synchronized ASCII art visualization.

```bash
# Basic playback
mediocre play-choreography output/composition.wav

# With choreography JSON (auto-detected if not specified)
mediocre play-choreography \
  output/composition.wav \
  output/composition-choreography.v3.json

# With options
mediocre play-choreography output/composition.wav \
  --osd \                 # Show on-screen playback info
  --no-title \            # Skip title cards
  --no-descript           # Skip subtitle overlays
```

**Playback Features:**

- **ASCII Art Animation**: Choreographed shapes synchronized to musical events
- **Title Screens**: Displays composition info and "starring" credits for ASCII shapes
- **Subtitle Support**: Overlay text from `.descript` file (if present)
- **Playlist Mode**: Auto-advance through multiple pieces in a directory
- **On-Screen Display**: Optional OSD with playback timing info

**Playback Options:**

| Flag            | Description                                 |
| --------------- | ------------------------------------------- |
| `--osd`         | Show on-screen display with playback info   |
| `--no-title`    | Skip title cards and "starring" displays    |
| `--no-descript` | Skip subtitle/descript text overlay         |
| `--record`      | Record playback                             |

**Choreography File Format:**

The choreography JSON uses the v1.1 schema with support for:
- Time-based, beat-based, and audio-reactive triggers
- Movement patterns (linear, circular, spiral, bounce, etc.)
- Transformations (scale, rotate, fade, color changes)
- Collision detection and particle effects
- Scene management and threaded animations

---

## Advanced Features

### Sequential Enhancement Mode

The `--sequential` flag enables the orchestrator-driven multi-agent enhancement loop. Instead of generating a complete piece in one shot, it:

1. **Generates a foundation** — The composition agent produces a short, high-quality thematic foundation (`sequentialMode: true`)
2. **Orchestrator decides** — The orchestrator agent analyzes the current composition and QA scores, then decides which worker agent to invoke next
3. **Worker agents enhance** — Three specialized workers:
   - **Composition agent** — Structural changes (extend, add voices, develop themes)
   - **Ornamentation agent** — Stylistic embellishments (trills, mordents, grace notes, genre-specific techniques)
   - **MIDI Expression agent** — Dynamics and expression (%%MIDI directives, volume automation, articulation)
4. **QA agent scores** — Every iteration is scored across 5 dimensions: technical, musical, fusion, completeness, duration
5. **Loop iterates** — Until the orchestrator decides quality is sufficient ("done"), max iterations reached, or the human quits (if `--interactive`)

```bash
# Sequential enhancement (autopilot)
mediocre generate -g "Minimalist_x_Drum_and_Bass" --sequential --max-iterations 5

# Sequential with human-in-the-loop gates
mediocre generate -g "Spectralism_x_Footwork" --sequential --interactive --max-iterations 10
```

**Enhancement Loop:**

```
Foundation Generation (composition agent, sequentialMode: true)
       ↓
Orchestrator Decision ←──── Human Gate (if --interactive)
       ↓
   "done"? ─── Yes ──→ Final Validation ──→ Done
       ↓
      No (invoke worker)
       ↓
   Worker Agent (composition | ornamentation | midi-expression)
       ↓
   abc2midi Validation ←──── Auto-fix errors if found
       ↓
   QA Scoring (5 dimensions) ←──── Human Gate (if --interactive)
       ↓
   Loop back to Orchestrator Decision
```

**Safety limits:** Configurable via `--max-iterations` (default: 10).

### Streaming Mode

The `--stream-text` flag uses the Vercel AI SDK's `streamText` for generation, which:

- **Prevents timeouts** on large compositions
- **Shows progress** during generation
- **Handles long pieces** that would otherwise fail

```bash
# Always use with sequential for best results
mediocre generate -g "Opera_x_Vaporwave" --sequential --stream-text
```

**When to use streaming:**

- Compositions with many voices/instruments
- Sequential expansion mode (multiple LLM calls)
- Long-form pieces (symphonies, operas)
- Any generation that times out without it

### Title Uniqueness Protection

Every generated composition automatically receives a unique title. The system:

1. Loads existing titles from `docs/data/compositions.json`
2. Checks new titles against the database (case-insensitive)
3. Regenerates duplicate titles using Claude Haiku (fast, cheap)
4. Falls back to timestamp-based uniqueness if needed

This prevents duplicate titles like multiple "SERIALIST CHAOS" or "PREPARED NOISE" compositions.

**No configuration needed** - this runs automatically on every generation.

### ABC Validation Pipeline

The validation pipeline prevents common synthesis failures:

```javascript
// Automatic cleaning applied to all generated ABC
cleanAbcNotation(abc); // Removes segfault-causing characters
validateAbcNotation(abc); // Checks structure and headers
validateWithAbc2Midi(file); // Tests actual compilation
```

**What gets cleaned:**

- Unicode characters that crash abc2midi
- Missing blank lines between header and body
- Invalid header sequences
- Problematic accidentals and ornaments

---

## Publishing Pipeline

The publishing system converts compositions to web-ready assets for the documentation site.

```bash
# Interactive selection of unpublished compositions
npm run publish:composition

# List all compositions (published and unpublished)
npm run publish:composition -- --list

# Unpublish a composition
npm run publish:composition -- --unpublish <composition-id>

# Dry run (show what would happen)
npm run publish:composition -- --dry-run
```

### Pipeline Steps

1. **Select** unpublished composition from ABC files
2. **Validate** ABC notation with abc2midi
3. **Generate MIDI** from ABC notation
4. **Synthesize WAV** using TiMidity with custom soundfonts
5. **Encode WebM** with ffmpeg (Opus audio, web-optimized)
6. **Generate PDF** score using abcm2ps + ghostscript
7. **Extract Sections** from ABC comments for timeline markers
8. **Update** compositions.json with metadata

### Asset Outputs

| Asset      | Location                      | Purpose      |
| ---------- | ----------------------------- | ------------ |
| WebM audio | `docs/media/<id>.webm`        | Web playback |
| PDF score  | `docs/media/<id>-score.pdf`   | Sheet music  |
| Metadata   | `docs/data/compositions.json` | Gallery data |

### Section Extraction

The pipeline extracts section markers from ABC comments:

```abc
% Section: Introduction
V:1
...music...

% Section: Development
V:1
...music...
```

Or numbered format:

```abc
% 1. Exposition
...music...

% 2. Development
...music...
```

Sections include calculated start times based on tempo, meter, and measure counts.

---

## Documentation Site

The `docs/` directory contains an interactive composition gallery.

### Structure

```
docs/
├── index.html          # Main page
├── data/
│   └── compositions.json  # Composition database
├── media/              # Audio and PDF assets
├── js/
│   ├── app.js          # Main application
│   └── components/
│       ├── music-player.js    # Audio player with sections
│       ├── music-card.js      # Composition cards
│       └── music-gallery.js   # Gallery grid
└── css/
    └── styles.css      # Terminal-style theme
```

### Features

- **Genre Filtering** - Filter by classical or modern genre tags
- **Sorting** - Sort by date, title, or genre
- **Modal View** - Detailed composition info with analysis
- **Section Links** - Click "Section I" in analysis to seek audio
- **PDF Viewer** - View sheet music in modal
- **Responsive** - Works on mobile and desktop

### Running Locally

```bash
# Simple HTTP server
cd docs
python -m http.server 8000
# or
npx serve .
```

---

## TiMidity Configuration

The `timidity-sanitized.cfg` provides high-quality MIDI synthesis with 30+ layered soundfonts.

### Soundfont Strategy

```
Layer 1: Base GM/GS/XG banks (GeneralUser GS, FluidR3)
Layer 2: Specialized instruments (orchestral, synths)
Layer 3: Premium overrides (Orpheus, Crisis, Musica)
Layer 4: Drum kits (jazz, rock, electronic)
```

### Key Features

**Instrument Overrides:**

```cfg
# Better trumpet sound
bank 0
56 %font "Airfont_340.sf2" 0 56  # Trumpet override
```

**Drum Note Remapping:**
Problematic percussion sounds are remapped to safe alternatives:

| Original                | Remapped To           | Reason           |
| ----------------------- | --------------------- | ---------------- |
| Note 71 (Whistle)       | Note 45 (Low Tom)     | Harsh sound      |
| Note 62 (Mute Hi Conga) | Note 47 (Low-Mid Tom) | Poor sample      |
| Note 73 (Guiro)         | Note 50 (High Tom)    | Rendering issues |

**Drumset Coverage:**

- Standard Kit (0)
- Room Kit (8)
- Power Kit (16)
- TR-808 Kit (25)
- TR-606 Kit (28)
- Jazz Kit (32)
- Brush Kit (40)
- Orchestra Kit (48)
- SFX Kit (56)

### Using Custom Config

```bash
# With timidity directly
timidity -c timidity-sanitized.cfg input.mid -Ow -o output.wav

# With fluidsynth (alternative)
fluidsynth -ni /path/to/soundfont.sf2 input.mid -F output.wav
```

---

## Hybrid Genre System

The `-C` (classical) and `-M` (modern) flags accept **anything** - genres, composers, artists, movements, techniques, aesthetics. Go wild.

### Suggested Classical Influences (`-C`)

**Composers:**

- Bach, Mozart, Beethoven, Brahms, Wagner, Mahler, Bruckner
- Debussy, Ravel, Satie, Fauré (Impressionist)
- Schoenberg, Webern, Berg, Babbitt (Serialist/12-tone)
- Stockhausen, Xenakis, Ligeti, Penderecki (Post-war avant-garde)
- Messiaen, Boulez, Berio, Nono (Spectralist/Modernist)
- Reich, Glass, Riley, Adams (Minimalist)
- Cage, Feldman, Tudor, Wolff (Experimental/Chance)
- Partch, Johnston, Tenney (Microtonal)
- Julius Eastman, Pauline Oliveros, Alvin Lucier
- Arvo Pärt, Górecki, Tavener (Holy Minimalism)

**Movements/Techniques:**

- Serialism, Spectralism, Minimalism, Maximalism
- Musique Concrète, Aleatory, Prepared Piano
- Futurism, Dadaism, Fluxus
- Total Serialism, Stochastic Music
- Extended Techniques, Graphic Scores

**Forms:**

- Opera, Cantata, Oratorio, Mass
- Symphony, Concerto, Sonata, Fugue
- Chamber Music, String Quartet
- Choral, A Cappella, Gregorian Chant

### Suggested Modern Influences (`-M`)

**Artists/Bands:**

- Autechre, Aphex Twin, Boards of Canada, Squarepusher (IDM)
- Venetian Snares, Igorrr, Machine Girl (Breakcore)
- Merzbow, Masami Akita, Prurient, Pharmakon (Noise)
- Sunn O))), Earth, Boris, Khanate (Drone/Doom)
- Lightning Bolt, Hella, Don Caballero, Battles (Math Rock)
- SOPHIE, Arca, A.G. Cook, Danny L Harle (Hyperpop/PC Music)
- 100 Gecs, Bladee, Drain Gang, Yung Lean
- Flying Lotus, Thundercat, Kamasi Washington (Brainfeeder)
- Tim Hecker, Fennesz, William Basinski (Ambient/Drone)
- Oneohtrix Point Never, James Ferraro (Vaporwave/Hypnagogic)
- Fred Frith, Eugene Chadbourne, John Zorn (Improv/Avant-Rock)
- Zach Hill, Death Grips, clipping. (Experimental Hip-Hop)
- Ornette Coleman, Sun Ra, Albert Ayler (Free Jazz)

**Genres:**

- Speedcore, Gabber, Hardcore, Terrorcore
- Footwork, Juke, Ghettotech, Ballroom
- Grime, Drill, UK Drill, Trap
- Vaporwave, Mallsoft, Future Funk
- Noise, Power Electronics, Harsh Noise Wall
- Black Metal, Death Metal, Grindcore
- Post-Punk, No Wave, Industrial

### Suggested Record Labels (`--record-label`)

The label aesthetic shapes the entire vibe:

| Label         | Aesthetic                                      |
| ------------- | ---------------------------------------------- |
| Hyperdub      | Bass-heavy, UK garage roots, experimental club |
| Warp          | IDM, abstract electronics, boundary-pushing    |
| PC Music      | Hypergloss, maximalist pop, uncanny valley     |
| PAN           | Experimental, deconstructed club, avant-garde  |
| Brainfeeder   | Jazz fusion, cosmic funk, beat science         |
| Southern Lord | Drone, doom, crushing heaviness                |
| Mute          | Industrial, electronic body music, dark synth  |
| 4AD           | Ethereal, dreamy, shoegaze aesthetics          |
| Kranky        | Drone, ambient, patient soundscapes            |
| Raster-Noton  | Glitch, microsound, precise digital            |
| Editions Mego | Noise, computer music, experimental            |
| Thrill Jockey | Post-rock, experimental, Chicago sound         |
| Sub Pop       | Grunge, indie, Pacific Northwest               |
| Ninja Tune    | Trip-hop, breakbeat, DJ culture                |
| Planet Mu     | Footwork, IDM, leftfield electronics           |

### Suggested Producers (`--producer`)

The producer shapes the sonic signature:

| Producer              | Signature                                  |
| --------------------- | ------------------------------------------ |
| A.G. Cook             | Hypercompressed, pitch-shifted, saccharine |
| Arca                  | Glitchy, detuned, alien, fluid             |
| SOPHIE                | Latex textures, hard surfaces, synthetic   |
| Flying Lotus          | Cosmic, jazz-inflected, beat collage       |
| Oneohtrix Point Never | Nostalgic, processed, uncanny              |
| Steve Albini          | Raw, dynamic, room sound                   |
| Brian Eno             | Ambient, generative, textural              |
| Burial                | Crackle, distance, 2-step rhythms          |
| Rashad Becker         | Sculptural, detailed, microsound           |
| Ben Frost             | Harsh, cinematic, overwhelming             |
| Goblin                | Horror, Italian prog, tension              |
| Vangelis              | Synth pads, sci-fi, emotional              |
| Timbaland             | Syncopated, unexpected, pop-forward        |
| Pharrell              | Minimal, bouncy, clean                     |
| Metro Boomin          | Dark, atmospheric, 808-driven              |

### Example Commands

```bash
# John Zorn meets PC Music
mediocre generate \
  -s "Avant-Pop Freakout" \
  -C "john zorn,naked city,tzadik,game piece,file card composition" \
  -M "100 gecs,sophie,a.g. cook,hyperpop,nightcore" \
  --producer "A.G. Cook" \
  --record-label "PC Music" \
  --sequential --stream-text

# Black metal meets spectralism
mediocre generate \
  -s "Ritual of Frequency" \
  -C "grisey,murail,spectralism,ligeti,scelsi,xenakis" \
  -M "deathspell omega,blut aus nord,ulver,sunn o))),liturgy" \
  --producer "Colin Marston" \
  --record-label "Profound Lore" \
  --sequential --stream-text

# Footwork meets minimalism
mediocre generate \
  -s "160 BPM Gradual Process" \
  -C "steve reich,terry riley,la monte young,philip glass,in c" \
  -M "rp boo,dj rashad,dj spinn,jlin,footwork,teklife" \
  --producer "Flying Lotus" \
  --record-label "Planet Mu" \
  --instruments "808,Marimba,Synthesizer,Sampler" \
  --sequential --stream-text

# Free jazz meets harsh noise
mediocre generate \
  -s "Total Freedom" \
  -C "ornette coleman,free jazz,sun ra,albert ayler,cecil taylor,aacm" \
  -M "merzbow,prurient,pharmakon,kevin drumm,harsh noise wall" \
  --producer "John Zorn" \
  --record-label "Tzadik" \
  --solo \
  --sequential --stream-text
```

---

## Additional Commands

| Command | Description | Usage |
| ------- | ----------- | ----- |
| `complain` | Send feedback about a prior orchestration session | `mediocre complain <sessionFile> "complaint text"` |
| `resume` | Resume a paused orchestration session | `mediocre resume <sessionFile> --max-iterations 5` |
| `compare` | A/B comparison of two ABC iteration files | `mediocre compare <fileA> <fileB>` |
| `checkpoints` | List all checkpoints and branches for a composition | `mediocre checkpoints <target>` |
| `branch` | Create a new branch from a specific iteration | `mediocre branch <abcFile> --from <iteration>` |
| `timidity-config` | Generate optimized TiMidity config using soundfont agent | `mediocre timidity-config <abcFile>` |
| `generate-mxml` | Generate MusicXML composition using Claude | `mediocre generate-mxml [options]` |
| `modify-mxml` | Modify existing MusicXML composition | `mediocre modify-mxml <mxmlFile> [options]` |
| `generate-onsets` | Extract onset timing data from audio | `mediocre generate-onsets --abc <abcFile>` |
| `generate-ascii-art` | Generate ASCII art assets | `mediocre generate-ascii-art [options]` |
| `browse` | Interactive TUI composition browser | `mediocre browse` |
| `info` | Display detailed composition information | `mediocre info <abcFile>` |
| `list` | List compositions with sorting/filtering | `mediocre list -s age -g baroque` |
| `convert` | Convert ABC to MIDI/WAV/PDF | `mediocre convert --to wav -i <abcFile>` |
| `process` | Apply audio effects to WAV files | `mediocre process -e reverb -i <wavFile>` |
| `dataset` | Build ML training datasets | `mediocre dataset -d ./output` |

---

## Architecture Documentation

Detailed technical documentation is in the `docs/` directory:

| Document | Description |
| -------- | ----------- |
| [COMPOSITION_WORKFLOW_OBJECT_MODE.md](docs/COMPOSITION_WORKFLOW_OBJECT_MODE.md) | Complete 25-step pipeline reference: agent schemas, data shapes at each stage, gate system, assembly logic |
| [sequential-generation-workflow.md](docs/sequential-generation-workflow.md) | Sequential generation workflow details |
| [CUSTOM_PROMPTS.md](docs/CUSTOM_PROMPTS.md) | Custom prompt system documentation |
| [CHOREOGRAPHY_V1.1_SCHEMA.md](docs/CHOREOGRAPHY_V1.1_SCHEMA.md) | Choreography v1.1 schema specification |

### Architecture Diagrams

Generated from Graphviz `.dot` sources in `docs/diagrams/`:

| Diagram | Description |
| ------- | ----------- |
| [main-pipeline.png](docs/diagrams/main-pipeline.png) | End-to-end generation pipeline |
| [agent-communication.png](docs/diagrams/agent-communication.png) | Agent interaction and delegation patterns |
| [orchestrator-loop.png](docs/diagrams/orchestrator-loop.png) | Orchestrator enhancement loop with gate integration |
| [data-flow.png](docs/diagrams/data-flow.png) | Data shapes at each pipeline stage |

---

## CLI Reference

### All Commands

| Command                | Description                                   |
| ---------------------- | --------------------------------------------- |
| `generate`             | Create new compositions                       |
| `modify`               | Transform existing compositions               |
| `enhance`              | Orchestrated multi-agent enhancement          |
| `combine`              | Merge multiple compositions                   |
| `complain`             | Send feedback about prior session             |
| `resume`               | Resume paused orchestration session           |
| `compare`              | A/B comparison of iteration files             |
| `checkpoints`          | List checkpoints and branches                 |
| `branch`               | Create branch from iteration                  |
| `genres`               | Generate hybrid genre names                   |
| `convert`              | Convert ABC to MIDI/WAV/PDF                   |
| `process`              | Apply audio effects                           |
| `validate-abc`         | Validate and fix ABC notation                 |
| `sanitize`             | Remap problematic drum notes                  |
| `info`                 | Display composition information               |
| `more-like-this`       | Generate similar compositions                 |
| `mix-and-match`        | Combine elements from multiple files          |
| `lyrics`               | Add lyrics to compositions                    |
| `timidity-config`      | Generate optimized TiMidity config            |
| `generate-mxml`        | Generate MusicXML composition                 |
| `modify-mxml`          | Modify existing MusicXML                      |
| `generate-onsets`      | Extract onset timing data                     |
| `generate-choreography`| Generate visual choreography                  |
| `play-choreography`    | Play choreography animation                   |
| `generate-ascii-art`   | Generate ASCII art assets                     |
| `dataset`              | Build ML training datasets                    |
| `browse`               | Interactive terminal browser                  |
| `list`                 | List compositions with filtering              |

### Global Flags

| Flag                   | Description                                  |
| ---------------------- | -------------------------------------------- |
| `--sequential`         | Enable orchestrator-driven enhancement       |
| `--stream-text`        | Use streaming API                            |
| `--interactive`        | Human-in-the-loop interactive control        |
| `--max-iterations <n>` | Maximum enhancement iterations               |
| `--midi` / `--no-midi` | Control MIDI generation                      |
| `-d, --output-dir`     | Output directory (default: ./output)         |
| `--verbose`            | Enable verbose logging                       |

---

## Tips & Best Practices

### For Best Results

1. **Always use `--sequential --stream-text`** for complex genres

   ```bash
   mediocre generate -g "Spectralist_x_IDM" --sequential --stream-text
   ```

2. **Use `--interactive` for fine control** over enhancement iterations

   ```bash
   mediocre generate -g "Baroque_x_Trap" --sequential --interactive --max-iterations 10
   ```

3. **Validate before converting** to catch issues early

   ```bash
   mediocre validate-abc -i output/*.abc
   ```

4. **Use the publish pipeline** for production-ready assets

   ```bash
   npm run publish:composition
   ```

5. **Layer soundfonts** in TiMidity for richer sound
   - Base: GeneralUser GS (comprehensive)
   - Orchestral: Sonatina Symphony Orchestra
   - Synths: Premium soundfonts for electronic genres

### Genre Selection Tips

- **Serialist + Electronic** genres work well (structured chaos)
- **Impressionist + Ambient** creates beautiful soundscapes
- **Baroque + Modern** provides strong rhythmic contrast
- **Prepared Piano + Noise** for experimental textures

### Performance Tips

- **Streaming mode** prevents API timeouts on long pieces
- **Sequential mode** produces more complete compositions
- **Batch validation** catches issues before synthesis
- **Custom soundfonts** dramatically improve audio quality

### Common Workflows

**New Composition:**

```bash
mediocre generate -g "Genre_x_Genre" --sequential --stream-text
mediocre validate-abc -i output/genre_x_genre-*.abc
npm run publish:composition
```

**Interactive Enhancement:**

```bash
mediocre generate -g "Genre_x_Genre" --sequential --interactive --max-iterations 10
```

**Enhance Existing:**

```bash
mediocre enhance "composition.abc" --interactive --max-iterations 5
```

**Combine Pieces:**

```bash
mediocre combine -f "piece1.abc" "piece2.abc" --sequential --stream-text
```

---

## Troubleshooting

### Debug Mode

```bash
# Verbose output for troubleshooting
mediocre generate -g "Test_x_Test" --verbose

# Check abc2midi directly
abc2midi input.abc -o output.mid 2>&1 | head -50
```

### Getting Help

```bash
# Command help
mediocre --help
mediocre generate --help

# Check version
mediocre --version
```

---

## License

MIT

---

<div align="center">

**Made with mediocrity**

</div>

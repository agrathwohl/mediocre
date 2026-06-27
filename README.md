<div align="center">

# MEDIOCRE-MUSIC

**An AI tool for generating unique, cutting-edge musical compositions via hybridization.**

![](./screenshot.png)

[![npm version](https://img.shields.io/npm/v/mediocre-music.svg?style=flat-square)](https://www.npmjs.com/package/mediocre-music)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square)](https://nodejs.org)

**[Listen to what it makes →](https://agrathwohl.github.io/mediocre/)**

</div>

---

Generate exceptionally new forms of music by merging disparate genres, influences, and properties.

mediocre-music runs a coordinated pipeline of AI agents — composer, QA critic, orchestrator, drum arranger, soundfont selector, ornament specialist — that iteratively generate and refine compositions in ABC notation, then render them to MIDI and WAV. You control how long it runs and how weird it gets.

It's built as a training data generator for audio ML, but the output is genuinely interesting on its own.

Supports a number of different compositional philosophies but is grounded in a baseline principle: that new technologies should expand and intensify musical possibilities, and not merely streamline, automate, and simplify the generation of that which has already been tried.

This project's success in pursuing this principle remains a work in progress, but the results so far are telling: cloud-based and local LLMs both are able to think musically, inventively, and experimentally. These models have the potential today to compose moving works of symphonic music, free jazz freakouts, and everything in between. Sometimes the stuff they come up with are genuinely puzzling, other times incredibly breathtaking, and still yet sometimes they just fail to even produce ABC notation that parses correctly. It's a gamble but it's one that shows great promise.

With Mediocre, you can compose a dataset of 5,000 music compositions or more in a single month of a Claude Max 200 subscription. Most of them will be at least serviceable, even if 10% of them are total flops.

---

## Hear It

**Stochastic Voltage** — Xenakis × Lightning Bolt

[stochastic-voltage.webm](https://github.com/user-attachments/assets/4c9de31c-53e5-48fe-a1aa-30fda538b8d6)

**Ionisation Infinitum: Noise Architecture for Orchestral Machines** — Varèse × Merzbow

[ionisation-infinitum.webm](https://github.com/user-attachments/assets/f8bfddbc-6ad2-49e1-adc8-37bb7718f308)

**Viennese Glitch Waltz** — Strauss × Oneohtrix Point Never

[viennese-glitch-waltz.webm](https://github.com/user-attachments/assets/eeffcca9-7832-480e-9741-0dbaefe0c109)

**Ride of the Hypercore Valkyries** — Wagner × Speedcore

[ride-of-the-hypercore-valkyries.webm](https://github.com/user-attachments/assets/129f107e-99cd-4068-a51d-5ebf98bd922f)

**Partchcore Genesis** — Harry Partch × Happy Hardcore

[partchcore-genesis.webm](https://github.com/user-attachments/assets/8babcb1f-0831-4f37-bb26-705225bd3555)

**[Full gallery with PDF scores and analysis →](https://agrathwohl.github.io/mediocre/)**

---

## Try It

```bash
npm install -g mediocre-music
export ANTHROPIC_API_KEY=your_key_here

mediocre generate \
  -C "Messiaen,Varese,Spectralism" \
  -M "Merzbow,Burial,Oneohtrix Point Never" \
  -s "Excessively Experimental" \
  --sequential --max-iterations 8 --stream-text
```

That's it. Walk away. Come back to rendered audio.

---

## What It Does

- **Genre fusion at scale** — give it any classical composers and modern artists, it figures out how to merge them
- **Multi-agent pipeline** — 10+ specialized agents (composer, QA critic, orchestrator, drum arranger, soundfont selector, ornamentation, MIDI expression, title guard, genre researcher) run in coordination
- **Iterative refinement** — the orchestrator scores each iteration and directs targeted improvements until the piece passes QA or hits your iteration limit
- **Human-in-the-loop** — `--interactive` mode lets you approve, reject, redirect, listen, or branch at every iteration
- **Full render pipeline** — ABC → MIDI → WAV → WebM, with PDF scores and structured JSON analysis for every piece
- **Soundfont-aware** — custom TiMidity configs per composition, soundfont selected per genre
- **Structured output** — composition agent uses Zod schemas to build valid ABC deterministically, not by hoping the LLM gets the syntax right
- **Dataset-ready** — everything outputs to structured JSON alongside the audio for ML training

---

## Install

```bash
npm install -g mediocre-music
```

**Requires:** Node.js 18+, `ANTHROPIC_API_KEY`, and these system tools:

```bash
# Ubuntu/Debian
apt install abcmidi abcm2ps ghostscript timidity fluidsynth sox ffmpeg

# macOS
brew install abcmidi abcm2ps ghostscript timidity fluidsynth sox ffmpeg

# NixOS
nix-shell -p abcmidi abcm2ps ghostscript timidity fluidsynth sox ffmpeg
```

---

## Key Flags

| Flag                   | What it does                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `-C`                   | Classical composers/genres to fuse from                                                          |
| `-M`                   | Modern artists/genres to fuse from                                                               |
| `-s`                   | Style description                                                                                |
| `--sequential`         | Enable multi-agent orchestration loop                                                            |
| `--max-iterations N`   | How many refinement cycles (default: 5)                                                          |
| `--interactive`        | Pause at each iteration for human control                                                        |
| `--stream-text`        | Watch the composition being written in real time                                                 |
| `-c N`                 | Generate N compositions                                                                          |
| `--model <id>`         | Use a different model (works with `--proxy-url` + `--api-key` for any provider)                  |
| `--llama-server <url>` | Use a local LLM via OpenAI-compatible API instead of Anthropic (e.g. `http://localhost:8001/v1`) |
| `--abc2midi <path>`    | Path to a custom abc2midi binary (see [abc2midi-llm fork](#abc2midi-llm-fork) below)             |
| `--instruments <list>` | Comma-separated instruments for template composition (e.g. `"sitar,tabla,fretless bass"`)        |

---

## Local Model Support

mediocre-music works with any OpenAI-compatible local inference server (llama.cpp, vLLM, etc.):

```bash
mediocre generate \
  -g "bartok_x_venetian_snares" \
  --llama-server http://localhost:8001/v1 \
  --abc2midi ~/.local/bin/abc2midi \
  --sequential --stream-text
```

No API key needed. The `--llama-server` flag switches all LLM calls from Anthropic to your local endpoint. Works with `generate`, `compose`, and all agent-based commands.

---

## Template Pipeline

Generate structured compositions by first creating a formal template, then filling it with LLM-generated content:

```bash
# Create a 192-bar ritual form template
mediocre template --form ritual --key Ddor --meter 7/8 --bars 192 \
  --instruments "shakuhachi,koto,erhu,fretless bass" \
  --pneuma organic

# Fill the template with LLM content
mediocre compose template-ritual.abc \
  --llama-server http://localhost:8001/v1 \
  --abc2midi ~/.local/bin/abc2midi
```

Available forms: `ritual`, `stack-overflow`, `source-transfer`, `accumulative`. Each generates a scaffold with pre-written structural voices (drums, drones), content slots for the LLM to fill, and temporal humanization directives.

---

## abc2midi-llm Fork

For the best results, use our [abc2midi-llm fork](https://github.com/agrathwohl/abc2midi-llm) which adds seven directives designed for LLM-generated music:

| Directive      | What it does                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `%%PNEUMA`     | Biological timing — note onset jitter, sinusoidal breathing tempo, cumulative drift, free time, rubato   |
| `%%ENSEMBLE`   | Inter-voice micro-timing offsets so independently generated voices sound like musicians playing together |
| `%%BREATH`     | Automatic rest insertion at phrase boundaries — the piece breathes                                       |
| `%%GRAVITY`    | Phrase-level weight — heavier openings, lighter middles, stretched endings                               |
| `%%ARTICULATE` | Context-aware note length — repeated notes shortened, leaps lengthened, phrase endings sustained         |
| `%%SPATIAL`    | Millisecond-scale delays between voice groups simulating physical distance                               |
| `%%TRANSFORM`  | Cross-voice algorithmic transformation — retrograde, inversion, fragmentation, pitch shift, time scale   |

Point mediocre-music at the fork with `--abc2midi`:

```bash
mediocre generate -g "messiaen_x_burial" \
  --system-prompt prompts/pneuma-system-prompt.txt \
  --abc2midi /path/to/abc2midi-llm/abc2midi
```

The template pipeline automatically includes these directives via `--pneuma` presets (`subtle`, `organic`, `drunk`, `ritual`, `mechanical`).

---

## More

Full CLI reference, architecture docs, advanced usage, and troubleshooting in **[DOCS.md](./DOCS.md)**.

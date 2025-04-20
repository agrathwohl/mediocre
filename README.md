<div align="center">
  
# 🎵 MEDIOCRE-MUSIC 🎵

**Genre-bending AI music composition toolkit** for LLM training dataset creation.

![](./screenshot.png)

[![npm version](https://img.shields.io/npm/v/mediocre-music.svg?style=flat-square)](https://www.npmjs.com/package/mediocre-music)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square)](https://nodejs.org)

</div>

> 🔊 **Create intricate, nuanced, and musically-sophisticated audio using our unique approach to LLM prompting for musical generation. Perfect for training LLM models on audio processing tasks like mixing, de-verbing, and effects processing.

## 🚀 Examples
[trombone.webm](https://github.com/user-attachments/assets/46cb7ad7-7d10-40ed-9cd5-aabb389450cc)

[berio.webm](https://github.com/user-attachments/assets/0926e777-8809-41e6-b963-464ed5f33a4f)
  
[pcmusic.webm](https://github.com/user-attachments/assets/bf2a1b1d-3582-4790-8b4b-8f40a7498944)

## ✨ Features

- 🎭 **Genre Fusion** - Combine classical and modern elements into unique hybrids
- 🤖 **AI Composition** - Generate ABC notation using Claude 3.7 Sonnet
- 🎼 **Format Conversion** - ABC → MIDI → WAV pipeline with PDF scores
- 🎛️ **Audio Processing** - Apply reverb, delay, distortion and more
- 📊 **Dataset Building** - Create structured datasets for ML training
- 🖥️ **Interactive TUI** - Browse compositions with playback and rating system

## 🛠️ Installation

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

## 📦 Requirements

- Node.js 18+
- Anthropic API key (Claude 3.7 Sonnet recommended)
- External tools:
  - `abcmidi` - ABC ↔ MIDI conversion
  - `abcm2ps` & `ghostscript` - PDF score generation
  - `timidity` - MIDI → WAV conversion
  - `sox` - Audio effects processing

## 🎮 Usage Guide

### Generate Wild Genre Hybrids

```bash
# Create 5 hybrid genres
mediocre genres -n 5

# Customize genre combinations
mediocre genres -c "baroque,serialist,minimalist" -m "techno,trap,vaporwave" -n 3
```

### Compose Musical Masterpieces

```bash
# Generate a composition for a specific hybrid
mediocre generate -g "Baroque_x_Techno" -c 1

# Generate multiple pieces with random hybrids
mediocre generate -C "baroque,classical" -M "techno,ambient" -c 3

# Use custom system prompt
mediocre generate -g "Renaissance_x_Trap" --system-prompt examples/custom-system-prompt.txt
```

### Process & Convert

```bash
# Convert ABC → MIDI → WAV
mediocre convert --to midi -d ./output
mediocre convert --to wav -d ./output

# Generate PDF scores
mediocre convert --to pdf -d ./output

# Add effects
mediocre process -d ./output -e reverb
```

### Modify Compositions

```bash
# Extend or transform existing pieces
mediocre modify "baroque_x_jazz-score1-1234567890" -i "Add a dramatic breakdown with harpsichord solo"
```

### Build ML Datasets

```bash
# Create structured dataset
mediocre dataset -d ./output
```

## 🎯 Hybrid Genre System

Mix and match from these *example* categories to create unique sonic fusions:

<table>
<tr>
<td width="50%" valign="top">

### 🎻 Classical/Traditional
- Baroque, Classical, Romantic
- Renaissance, Medieval, Impressionist
- Serialist, Minimalist, Neoclassical
- Opera, Cantata, Oratorio
- Chamber, Concerto, Ballet, Fugue

</td>
<td width="50%" valign="top">

### 🎧 Modern
- Techno, House, Drum and Bass
- Dubstep, Ambient, IDM, Glitch
- Vaporwave, Lo-fi, Chillwave
- Trap, Drill, Grime, Hip Hop
- Rock, Metal, Punk, Jazz, Funk

</td>
</tr>
</table>

Come up with your own crazy ideas and give them a try! I merged Cardi B and
John Zorn and I think it turned out really great.

## 🧠 How It Works

1. **Genre Fusion** - AI combines musical traditions into hybrid forms
2. **Composition** - Claude creates ABC notation with abc2midi extensions
3. **Conversion** - Pipeline transforms notation into playable formats
4. **Processing** - Effects chain generates training pairs
5. **Dataset** - Organized structure with complete metadata

## 📁 Project Structure

```
mediocre/
├── src/              # Source code
│   ├── commands/     # Command implementations
│   ├── utils/        # Utility functions
│   └── index.js      # Entry point
├── output/           # Generated music files 
├── dataset/          # Final processed dataset
└── temp/             # Temporary files
```

## 📄 License

MIT

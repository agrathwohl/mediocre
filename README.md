# Mediocre

>A tool for generating hybrid genre music compositions for training LLM models on audio processing tasks like mixing, de-verbing, and effects processing.

![](./screenshot.png)

## Features

- Generate hybrid music genres combining classical and modern elements
- Create ABC notation files using Claude API with abc2midi extensions
- Support for custom system and user prompts for fine-tuned music generation
- Modify existing compositions with specific instructions (e.g., make longer, add sections)
- Convert ABC to MIDI files
- Create PDF score visualizations 
- Convert MIDI to WAV audio files
- Apply audio effects (reverb, delay, distortion)
- Build datasets for training models
- Interactive TUI browser with playback controls and rating system

## Requirements

- Node.js 18+
- Anthropic API key (Claude 3.7 Sonnet recommended)
- External tools:
  - abcmidi (for ABC to MIDI conversion)
  - abcm2ps and ghostscript (for PDF generation)
  - timidity (for MIDI to WAV conversion) 
  - sox (for audio effects processing)

## Examples
[berio.webm](https://github.com/user-attachments/assets/0926e777-8809-41e6-b963-464ed5f33a4f)

[pcmusic.webm](https://github.com/user-attachments/assets/bf2a1b1d-3582-4790-8b4b-8f40a7498944)


## Installation

### CLI Tool

Install the CLI tool onto your system by running:

```bash
npm install mediocre-music -g
```

### Development Version

1. Clone the repository:
```bash
git clone https://github.com/yourusername/mediocre.git
cd mediocre
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your Anthropic API key:
```bash
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## Usage

### Generating Hybrid Genres

Generate hybrid genre names by combining classical and modern genres:

```bash
# Generate 5 hybrid genres using specific genre lists
npm run dev -- genres -c "baroque,classical,romantic" -m "techno,ambient,glitch" -n 5

# Generate 5 hybrid genres using default genre lists
npm run dev -- genres -n 5
```

### Generating Compositions

Generate music for specific hybrid genres:

```bash
# Generate a composition for a specific hybrid genre
npm run dev -- generate -g "Baroque_x_Techno" -c 1

# Generate multiple compositions using random hybrid genres from lists
npm run dev -- generate -C "baroque,classical" -M "techno,ambient" -c 3

# Generate a composition using a custom system prompt
npm run dev -- generate -g "Baroque_x_Jazz" --system-prompt examples/custom-system-prompt.txt
```

For more information on using custom prompts, see [Custom Prompts Guide](./docs/CUSTOM_PROMPTS.md).

### Converting and Processing Files

```bash
# Convert ABC to MIDI
npm run dev -- convert --to midi -d ./output

# Convert ABC to PDF
npm run dev -- convert --to pdf -d ./output

# Convert MIDI to WAV
npm run dev -- convert --to wav -d ./output

# Process audio effects
npm run dev -- process -d ./output -e reverb
```

### Modifying Compositions

```bash
# Modify a composition with inline instructions
npm run dev -- modify "baroque_x_jazz-score1-1234567890" -i "Make it longer with a dramatic breakdown section"

# Modify a composition using instructions from a file
npm run dev -- modify "baroque_x_jazz-score1-1234567890" -f examples/modification-instructions.txt
```

### Building Datasets

```bash
npm run dev -- dataset -d ./output
```

## Hybrid Genre System

The system creates hybrid genres by combining classical and modern musical traditions.
The following are merely *examples*. Feel free to come up with whatever crazy
genres and conventions you like. I've done "Cardi B x King Gizzard and the Lizard Wizard"
in a "Rockabilly" style and it sounded pretty alright to me!

### Classical/Traditional Genres
- Baroque, Classical, Romantic, Renaissance, Medieval
- Impressionist, Serialist, Minimalist, Neoclassical
- Opera, Cantata, Oratorio, Sonata, Symphony
- Chamber, Concerto, Ballet, Fugue

### Modern Genres
- Techno, House, Drum and Bass, Dubstep, Ambient
- IDM, Glitch, Vaporwave, Lo-fi, Chillwave
- Trap, Drill, Grime, Hip Hop, R&B
- Rock, Metal, Punk, Grunge, Indie
- Jazz, Funk, Disco, Soul, Blues

Hybrid genres are named in the format: `Classical_x_Modern` (e.g., "Baroque_x_Techno")

## Supported ABC2MIDI Extensions

The system uses only the most reliable abc2midi extensions to ensure compatibility with all standard ABC processors:

### Instrument Selection
- `%%MIDI program [channel] n` - Sets the instrument for a specific channel
  Example: `%%MIDI program 1 40` (Violin on channel 1)

### Dynamics
- `%%MIDI beat a b c n` - Controls note velocities
  Example: `%%MIDI beat 90 80 65 1`
- Standard ABC dynamics: `!p!`, `!f!`, etc.

### Transposition
- `%%MIDI transpose n` - Transposes the output
  Example: `%%MIDI transpose -12` (down one octave)

### Simple Chord Accompaniment
- `%%MIDI gchord string` - Configures how guitar chords are generated
  Example: `%%MIDI gchord fzczfzcz`

## Project Structure

```
mediocre/
├── src/              # Source code
│   ├── commands/     # Command implementations
│   ├── utils/        # Utility functions including genre generator
│   └── index.js      # Entry point
├── output/           # Generated music files 
├── dataset/          # Final processed dataset
└── temp/             # Temporary files
```

## How it Works

1. **Genre Generation**: Creates hybrid genres combining classical and modern traditions
2. **Music Generation**: Uses Claude to create ABC notation music files with minimal abc2midi extensions
3. **Conversion**: Transforms ABC notation to MIDI, PDF, and WAV formats
4. **Processing**: Applies audio effects to generate training pairs
5. **Dataset Building**: Organizes files into a structured dataset with metadata

## License

MIT

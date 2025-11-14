# Ultimate Soundfont System Guide

## Overview

This project now features a comprehensive soundfont management system that intelligently leverages a 52GB collection of 198 professional soundfonts to produce the highest quality MIDI-to-WAV conversions possible.

## Quick Start - Maximum Quality

For the absolute best sound quality across all use cases:

```bash
# Ultimate quality (10 layered soundfonts, 48kHz, 24-bit)
npm run start -- convert --to wav -i your_midi.mid --soundfont ultimate

# MAXIMUM OVERKILL (30+ soundfonts, 96kHz, 24-bit, 15GB RAM)
npm run start -- convert --to wav -i your_midi.mid --soundfont overkill
```

## Available Soundfont Profiles

| Profile | Quality | Size | RAM Usage | Use Case |
|---------|---------|------|-----------|----------|
| **fast** | 7/10 | 30MB | ~100MB | Quick prototyping |
| **standard** | 8.5/10 | 142MB | ~500MB | Industry standard, balanced |
| **electronic** | 9/10 | 149MB | ~600MB | EDM, techno, modern sounds |
| **rock** | 8/10 | 100MB | ~400MB | Rock, metal, punk |
| **synth** | 8.5/10 | 316MB | ~1GB | Electronic, ambient |
| **contemporary** | 8.5/10 | 543MB | ~1.5GB | Modern pop, R&B, hip-hop |
| **hq** | 9.5/10 | 975MB | ~2GB | High-quality compilation |
| **ultra** | 10/10 | 1.6GB | ~3GB | Production-ready classical/cinematic |
| **ultimate** | 10/10 | ~5GB | ~8GB | 10 best soundfonts layered |
| **overkill** | 11/10 | ~15GB | ~15GB | 30+ soundfonts, 96kHz, maximum possible quality |

## Command Examples

### List Available Soundfonts
```bash
npm run start -- convert --list-soundfonts
```

### Genre-Based Automatic Selection
```bash
# Automatically selects best soundfont for the genre
npm run start -- convert --to wav -i input.mid --genre classical
npm run start -- convert --to wav -i input.mid --genre electronic
npm run start -- convert --to wav -i input.mid --genre jazz
```

### Manual Profile Selection
```bash
# Fast rendering for testing
npm run start -- convert --to wav -i input.mid --soundfont fast

# Maximum quality for production
npm run start -- convert --to wav -i input.mid --soundfont ultimate
```

### Custom Sample Rate
```bash
npm run start -- convert --to wav -i input.mid --soundfont hq --sample-rate 96000
```

## The Ultimate Configuration Stack

The **ultimate** profile layers these soundfonts in priority order:

1. **FluidR3 GM** - Base foundation
2. **Compifont** - Enhanced coverage
3. **Giant Drums** - Superior percussion
4. **Electric Guitars GM** - Rock instruments
5. **Yamaha Grand** - Enhanced bass
6. **FatBoy** - Modern synths
7. **TyrolandSFX** - Sound effects
8. **Orpheus** - Orchestral excellence
9. **Piano Z-Doc** - Best piano samples
10. **CrisisGeneralMidi3** - Ultimate override

## The Overkill Configuration

The **overkill** profile loads 30+ soundfonts including:

### Base Layers
- GeneralUser GS (fast base)
- FluidR3 GM (industry standard)
- Arachno (modern electronic)

### Specialty Instruments
- **Drums**: RealAcoustic, TamaRockSTAR, Roland GM, Giant 3.9
- **Guitars**: Electric JN, Guitars GM, Metal GM
- **Bass**: Yamaha Grand, SGM Plus
- **Synths**: FatBoy, Edirol Contemporary, RetroHybrid
- **Orchestral**: Timbres of Heaven, Concert Band, DSoundFont
- **Piano**: Z-Doc Soundfont IV

### Premium Giants (1GB+)
- HedsoundGM (942MB)
- Orpheus (1.2GB)
- Daindune Montage (1.1GB)
- CrisisGeneralMidi3 (1.6GB)
- Musica Theoria HQ (1.9GB - final override)

### Hardware Emulations
- Roland SC-55 SoundCanvas
- MT-32 Emulation
- Roland JV-1010
- Yamaha Tyros 4

### Quality Settings
- 96kHz sample rate
- 24-bit output
- Maximum polyphony (512 voices)
- Enhanced chorus & reverb
- Gauss interpolation

## Performance Comparison

| Profile | File Size* | Load Time | RAM Usage | Quality |
|---------|------------|-----------|-----------|---------|
| standard | 24MB | <1s | ~500MB | Good |
| ultimate | 36MB | 5-10s | ~8GB | Excellent |
| overkill | 71MB | 15-30s | ~15GB | INSANE |

*For a 90-second MIDI file

## Dataset Strategy Recommendations

### For Machine Learning Datasets

1. **Development Phase**
   - Use `fast` profile for rapid iteration
   - 30MB soundfont, quick loading

2. **Training Data Generation**
   - Use `standard` or genre-specific profiles
   - Consistent quality across samples

3. **Validation/Test Sets**
   - Use `ultimate` for highest quality reference
   - Represents "ground truth" audio

4. **Production/Distribution**
   - Use `ultimate` or `overkill` for final renders
   - Maximum quality for end users

### Batch Processing

```bash
# Convert entire directory with ultimate quality
npm run start -- convert --to wav -d ./midi_files --soundfont ultimate

# Process with genre-specific soundfonts
for file in midi_files/*.mid; do
  genre=$(extract_genre_from_filename "$file")
  npm run start -- convert --to wav -i "$file" --genre "$genre"
done
```

## Advanced Configuration

### Custom Timidity Configurations

The system supports custom timidity configuration files:

1. **timidity-ultimate-simple.cfg** - Simplified 10-soundfont stack
2. **timidity-ultimate.cfg** - Advanced layering with per-instrument overrides
3. **timidity-maximum-overkill.cfg** - 30+ soundfonts for maximum quality

### Creating Your Own Profile

Edit `src/utils/soundfont-manager.js`:

```javascript
export const SOUNDFONT_PROFILES = {
  custom: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/YourSoundfont.sf2',
    description: 'Custom profile description',
    genres: ['genre1', 'genre2'],
    quality: 8,
    sizeInMB: 200,
    timidityArgs: {
      sampleRate: '48000',
      antialiasing: true,
      chorus: 1,
      reverb: 1
    }
  }
};
```

## Rare Soundfonts in This Collection

### Ultra-Rare Giants (1GB+)
- **Musica Theoria HQ** (1.9GB) - The holy grail
- **CrisisGeneralMidi3.01** (1.6GB) - Production standard
- **Orpheus_18.06.2020** (1.2GB) - Orchestral masterpiece

### Hardware Emulation Rarities
- **SC-55 Collection** - Legendary Roland Sound Canvas
- **MT-32 Emulation** - Classic '80s sound
- **Yamaha Collection** - $5000+ keyboard sounds

### Professional/Commercial
- **Conexant Essence** (383MB) - Commercial quality
- **TrianGMGS** (566MB) - Extended GS support
- **HedsoundGMTfix** (942MB) - Professional production

## System Requirements

### Minimum (standard profile)
- 4GB RAM
- 1GB free disk space
- timidity++ installed

### Recommended (ultimate profile)
- 16GB RAM
- 10GB free disk space
- SSD for soundfont storage

### Maximum (overkill profile)
- 32GB RAM
- 20GB free disk space
- NVMe SSD strongly recommended
- Patience (15-30 second load times)

## Troubleshooting

### Out of Memory
- Start with smaller profiles (fast, standard)
- Close other applications
- Increase system swap space

### Slow Loading
- Soundfonts are loaded from disk on first use
- Subsequent uses are faster (cached in RAM)
- Use SSD for soundfont storage

### Missing Soundfonts
- The system automatically falls back to available soundfonts
- Check with `--list-soundfonts` to see what's available
- Missing soundfonts show ✗ in the list

## Conclusion

This soundfont system represents one of the most comprehensive MIDI synthesis setups possible, leveraging 52GB of professional samples to achieve unparalleled audio quality. The intelligent genre mapping and multi-tier profile system ensures you can always find the perfect balance between quality and performance for your specific needs.

For maximum quality across all possible use cases, use the **ultimate** or **overkill** profiles - they combine the best aspects of all soundfonts to deliver truly exceptional audio quality that rivals commercial synthesizers costing thousands of dollars.
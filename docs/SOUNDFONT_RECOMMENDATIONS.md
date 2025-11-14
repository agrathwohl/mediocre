# Soundfont Recommendations for MIDI to WAV Conversion

## Your Soundfont Collection Overview

You have an **impressive 52GB collection** of 198 soundfonts in the `soundfonts/500-soundfonts-full-gm-sets/` directory. This is one of the most comprehensive GM (General MIDI) soundfont collections available.

## Top Quality Recommendations

### Tier 1: Professional Quality Full GM Sets (Best Overall)

These soundfonts offer the best balance of quality, completeness, and file size:

1. **FluidR3 GM.sf2** (142MB)
   - Industry standard, excellent balance
   - Great for orchestral and acoustic instruments
   - Wide compatibility, clean sound
   - Command: `timidity input.mid -x "soundfont /path/to/FluidR3 GM.sf2" -Ow -o output.wav`

2. **GeneralUser GS v1.471.sf2** (30MB)
   - Excellent quality-to-size ratio
   - Optimized for real-time playback
   - Good for rapid prototyping
   - Command: `timidity input.mid -x "soundfont /path/to/GeneralUser GS v1.471.sf2" -Ow -o output.wav`

3. **Arachno SoundFont - Version 1.0.sf2** (149MB)
   - Exceptional for electronic and modern styles
   - Strong bass and drum sounds
   - Good MIDI compatibility

### Tier 2: Large High-Fidelity Sets (Maximum Quality)

For when file size isn't a concern and you need the highest quality:

1. **CrisisGeneralMidi3.01.sf2** (1.6GB)
   - Highest quality samples
   - Best for final production
   - Excellent dynamic range

2. **Compifont_13082016.sf2** (975MB)
   - Compilation of best samples
   - Great all-around quality
   - Good for mixed genres

3. **DSoundFontV4.sf2** (555MB)
   - Balanced high-quality set
   - Good stereo imaging
   - Suitable for most genres

### Specialized Soundfonts by Genre

#### Classical/Orchestral
- **Concert** series (220-301MB)
- **Free** series (388-393MB)
- **Airfont_380_Final.sf2** (264MB)

#### Electronic/Modern
- **Edirol_SD-20_Contemporary.sf2** (543MB)
- **FatBoy-v0.786.sf2** (316MB)
- **Alex_GM.sf2** (459MB)

#### Rock/Pop
- **Guitar_Heavy_Collection.sf2**
- **4RockMix.sf2**
- **Guitar_for_Metal_GM.sf2**

#### Drums (Specialized)
- **Drums_TamaRockSTAR.sf2** - Rock drums
- **Drums_RealAcousticDrumsExtra.sf2** - Acoustic drums
- **Drums_GiantSoundfontDrumKit2.0XG.sf2** - Comprehensive kit

## Integration Strategy for Your Project

### 1. Create a Soundfont Configuration System

Create `src/utils/soundfont-manager.js`:

```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SOUNDFONT_PROFILES = {
  // Quick & Good
  fast: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/GeneralUser GS v1.471.sf2',
    description: 'Fast rendering, good quality (30MB)',
    genres: ['all'],
    quality: 7
  },

  // Balanced
  standard: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/FluidR3 GM.sf2',
    description: 'Industry standard, excellent balance (142MB)',
    genres: ['classical', 'jazz', 'acoustic'],
    quality: 8.5
  },

  // High Quality
  hq: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/Arachno SoundFont - Version 1.0.sf2',
    description: 'High quality, modern sounds (149MB)',
    genres: ['electronic', 'pop', 'modern'],
    quality: 9
  },

  // Maximum Quality
  ultra: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/CrisisGeneralMidi3.01.sf2',
    description: 'Highest quality, large size (1.6GB)',
    genres: ['orchestral', 'cinematic', 'production'],
    quality: 10
  },

  // Genre-specific
  rock: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/4RockMix.sf2',
    description: 'Optimized for rock music',
    genres: ['rock', 'metal', 'punk'],
    quality: 8
  },

  electronic: {
    path: 'soundfonts/500-soundfonts-full-gm-sets/FatBoy-v0.786.sf2',
    description: 'Electronic and synthesized sounds (316MB)',
    genres: ['techno', 'edm', 'electronic'],
    quality: 8.5
  }
};

export function selectSoundfontForGenre(genre) {
  // Smart selection based on genre
  const genreLower = genre.toLowerCase();

  // Check for exact genre matches
  for (const [profile, config] of Object.entries(SOUNDFONT_PROFILES)) {
    if (config.genres.includes(genreLower) || config.genres.includes('all')) {
      return config;
    }
  }

  // Default to standard
  return SOUNDFONT_PROFILES.standard;
}

export function getSoundfontPath(profile = 'standard') {
  const config = SOUNDFONT_PROFILES[profile] || SOUNDFONT_PROFILES.standard;
  return path.resolve(__dirname, '../..', config.path);
}
```

### 2. Enhanced Timidity Configuration

Create a timidity configuration file `timidity.cfg`:

```bash
# High-quality rendering settings
dir /home/gwohl/code/mediocre/soundfonts/500-soundfonts-full-gm-sets

# Default soundfont (can be overridden)
soundfont "FluidR3 GM.sf2"

# Quality settings
opt -EFchorus=2
opt -EFreverb=2
opt -s 48000  # 48kHz sample rate
opt -a      # Anti-aliasing
```

### 3. Update Your Conversion Command

Enhance `src/commands/convert-wav.js` to use soundfonts:

```javascript
async function convertFile(inputPath, outputPath, options = {}) {
  try {
    console.log(`Converting ${inputPath} to ${outputPath}`);

    // Select appropriate soundfont
    const soundfontProfile = options.soundfont || 'standard';
    const soundfontPath = getSoundfontPath(soundfontProfile);

    // Check if soundfont exists
    if (!fs.existsSync(soundfontPath)) {
      throw new Error(`Soundfont not found: ${soundfontPath}`);
    }

    // Build timidity arguments
    const timidityArgs = [
      inputPath,
      '-Ow',  // Output WAV
      '-o', outputPath,
      '-s', options.sampleRate || '48000',  // Sample rate
      '-a',  // Anti-aliasing
      '-x', `soundfont ${soundfontPath}`,  // Specify soundfont
    ];

    // Add quality settings
    if (options.quality === 'high') {
      timidityArgs.push(
        '-EFchorus=2',    // Enhanced chorus
        '-EFreverb=2',    // Enhanced reverb
        '--output-24bit'  // 24-bit output
      );
    }

    // Convert MIDI to WAV using timidity
    await execa('timidity', timidityArgs);

    console.log(`Converted ${inputPath} to ${outputPath} using ${soundfontProfile} soundfont`);
  } catch (error) {
    throw new Error(`Failed to convert ${inputPath} to WAV: ${error.message}`);
  }
}
```

## Recommended Workflow for Dataset Creation

### 1. Profile-Based Rendering
Render the same MIDI with different soundfonts to create variety:

```bash
# Quick test
mediocre convert --to wav --soundfont fast input.mid

# Standard quality
mediocre convert --to wav --soundfont standard input.mid

# High quality for final dataset
mediocre convert --to wav --soundfont ultra input.mid
```

### 2. Genre-Matched Rendering
Match soundfonts to the musical genre for optimal results:

- **Classical/Baroque**: FluidR3 GM or Concert series
- **Electronic/Techno**: FatBoy, Arachno, or Edirol Contemporary
- **Rock/Metal**: 4RockMix with specialized guitar soundfonts
- **Jazz**: FluidR3 GM or Alex_GM
- **Orchestral/Cinematic**: CrisisGeneralMidi or large Free series

### 3. Multi-Soundfont Dataset Strategy

For ML training diversity, render each composition with 3-4 different soundfonts:
1. A fast/lightweight soundfont for quick iteration
2. A standard balanced soundfont for general quality
3. A genre-specific soundfont for authenticity
4. An ultra-quality soundfont for premium samples

### 4. Quality Settings Recommendations

#### Development/Testing
```bash
timidity input.mid -Ow -o output.wav -s 44100 -x "soundfont GeneralUser.sf2"
```

#### Standard Dataset
```bash
timidity input.mid -Ow -o output.wav -s 48000 -a -x "soundfont FluidR3.sf2"
```

#### Premium Dataset
```bash
timidity input.mid -Ow -o output.wav -s 48000 -a -EFchorus=2 -EFreverb=2 --output-24bit -x "soundfont CrisisGeneralMidi.sf2"
```

## Additional Tips

1. **Batch Processing**: Create scripts to render with multiple soundfonts automatically
2. **A/B Testing**: Compare outputs from different soundfonts for quality assessment
3. **File Size Management**: Use smaller soundfonts during development, larger for production
4. **Caching**: Load frequently-used soundfonts into memory for faster processing
5. **Metadata**: Tag output files with the soundfont used for tracking

## Troubleshooting

### If timidity can't find soundfonts:
```bash
# Set environment variable
export TIMIDITY_CFG=/home/gwohl/code/mediocre/timidity.cfg

# Or use absolute paths in commands
timidity input.mid -x "soundfont /absolute/path/to/soundfont.sf2" -Ow -o output.wav
```

### For better performance:
- Use `-Fast` flag for quick previews
- Use `--buffer-fragments=4,8` for smoother playback
- Consider `-Od` for direct audio output during testing

This comprehensive soundfont collection gives you professional-grade flexibility for creating high-quality, diverse audio datasets from your MIDI compositions.
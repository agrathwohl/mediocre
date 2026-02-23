/**
 * FluidSynth Playback Wrapper - Native CLI-based synthesis
 *
 * Uses native fluidsynth command-line tool (NOT WebAssembly)
 * Eliminates TiMidity segfaults and WASM memory limits
 *
 * Features:
 * - Load 41+ soundfonts simultaneously (no WASM memory limits)
 * - Direct CLI execution via child_process
 * - MIDI playback and WAV export
 * - Optimal config generation
 */

import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';

const SOUNDFONT_DIR = '/home/gwohl/code/mediocre/soundfonts/500-soundfonts-full-gm-sets';

/**
 * FluidSynth playback manager (CLI-based)
 */
export class FluidSynthPlayback {
  constructor(options = {}) {
    this.loadedSoundfonts = [];
    this.midiEvents = [];
    this.sampleRate = options.sampleRate || 44100;
    this.gain = options.gain || 0.5;
    this.ready = false;
  }

  /**
   * Initialize with soundfont stack
   * Just validates and stores soundfont paths - actual loading happens at render time
   */
  async initialize(soundfontSelection) {
    console.log('🎹 Initializing FluidSynth (CLI)...');
    console.log(`   Sample rate: ${this.sampleRate} Hz`);
    console.log(`   Gain: ${this.gain}`);

    const soundfonts = soundfontSelection.soundfonts || soundfontSelection;

    // Validate soundfont paths
    for (let i = 0; i < soundfonts.length; i++) {
      const soundfont = soundfonts[i];
      const sfPath = path.join(SOUNDFONT_DIR, soundfont);

      try {
        await fs.access(sfPath);
      } catch {
        console.warn(`   ⚠️  Soundfont not found: ${soundfont}`);
        continue;
      }

      this.loadedSoundfonts.push({
        filename: soundfont,
        path: sfPath,
        order: i,
        category: this.getCategoryForSoundfont(soundfont, soundfontSelection.categories),
      });
    }

    console.log(`✅ Ready to use ${this.loadedSoundfonts.length}/${soundfonts.length} soundfonts`);
    this.ready = true;
  }

  /**
   * Get category for a soundfont from agent's categorization
   */
  getCategoryForSoundfont(filename, categories) {
    if (!categories) return 'unknown';

    for (const [category, soundfonts] of Object.entries(categories)) {
      if (soundfonts && soundfonts.includes(filename)) {
        return category;
      }
    }

    return 'uncategorized';
  }

  /**
   * Play MIDI file through FluidSynth CLI and render to WAV
   * @param {string|Buffer} midiData - Path to MIDI file
   * @param {string} outputWav - Output WAV path
   * @returns {Promise<Object>} Result with paths and config
   */
  async playMIDI(midiPath, outputWav) {
    if (!this.ready) {
      throw new Error('FluidSynth not initialized. Call initialize() first.');
    }

    console.log('🎵 Rendering MIDI with FluidSynth CLI...');
    console.log(`   Source: ${path.basename(midiPath)}`);
    console.log(`   Soundfonts: ${this.loadedSoundfonts.length}`);

    // Build fluidsynth command
    // fluidsynth -ni soundfont1.sf2 soundfont2.sf2 ... input.mid -F output.wav -r 44100 -g 0.5
    const args = [
      '-ni',  // Non-interactive, no audio driver
      '-r', String(this.sampleRate),  // Sample rate
      '-g', String(this.gain),  // Gain
    ];

    // Add all soundfonts
    for (const sf of this.loadedSoundfonts) {
      args.push(sf.path);
    }

    // Add MIDI file
    args.push(midiPath);

    // Output to WAV
    args.push('-F', outputWav);

    console.log(`   ▶️  Running: fluidsynth ${args.slice(0, 5).join(' ')} ... (${this.loadedSoundfonts.length} soundfonts)`);
    const startTime = Date.now();

    try {
      // Run fluidsynth CLI
      await execa('fluidsynth', args);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`   ✅ Rendered in ${duration}s`);

      return {
        wavPath: outputWav,
        midiPath,
        sampleRate: this.sampleRate,
        config: this.generateOptimalConfig(),
        soundfontStack: this.loadedSoundfonts,
      };
    } catch (error) {
      throw new Error(`FluidSynth CLI failed: ${error.message}`);
    }
  }

  /**
   * Generate optimal playback config from loaded soundfonts and MIDI events
   */
  generateOptimalConfig() {
    return {
      version: '1.0',
      synthesizer: 'FluidSynth (js-synthesizer)',
      sampleRate: this.sampleRate,
      gain: this.gain,
      soundfontStack: this.loadedSoundfonts.map(sf => ({
        filename: sf.filename,
        order: sf.order,
        category: sf.category,
      })),
      loadedCount: this.loadedSoundfonts.length,
      midiEventCount: this.midiEvents.length,
    };
  }

  /**
   * Close and cleanup (no-op for CLI version)
   */
  close() {
    // CLI version doesn't need cleanup - process exits after render
    this.loadedSoundfonts = [];
    this.ready = false;
  }
}

/**
 * High-level helper: Convert ABC to WAV using FluidSynth CLI
 * @param {string} abcPath - Path to ABC file
 * @param {Object} soundfontSelection - Soundfont selection from agent
 * @param {Object} options - Conversion options
 * @returns {Promise<Object>} Result with paths and config
 */
export async function convertAbcToWavWithFluidSynth(abcPath, soundfontSelection, options = {}) {
  console.log(`\n🎼 Converting ABC to WAV with FluidSynth`);
  console.log(`   Source: ${path.basename(abcPath)}`);

  // 1. Convert ABC to MIDI using abc2midi
  const midiPath = abcPath.replace(/\.abc$/, '.mid');
  console.log('\n📝 Step 1: Converting ABC to MIDI...');

  try {
    await execa('abc2midi', [abcPath, '-o', midiPath]);
    console.log(`   ✅ Generated: ${path.basename(midiPath)}`);
  } catch (error) {
    throw new Error(`abc2midi failed: ${error.message}`);
  }

  // 2. Initialize FluidSynth with soundfont stack
  const fluidsynth = new FluidSynthPlayback({
    sampleRate: options.sampleRate || 44100,
    gain: options.gain || 0.5,
  });

  await fluidsynth.initialize(soundfontSelection);

  // 3. Render MIDI to WAV using CLI
  const wavPath = abcPath.replace(/\.abc$/, '.wav');
  const result = await fluidsynth.playMIDI(midiPath, wavPath);

  // 4. Save optimal config
  const configPath = abcPath.replace(/\.abc$/, '.fluidsynth.json');
  await fs.writeFile(configPath, JSON.stringify(result.config, null, 2));
  console.log(`   ✅ Saved config: ${path.basename(configPath)}`);

  // 5. Clean up
  fluidsynth.close();

  console.log('\n✅ FluidSynth conversion complete!\n');

  return {
    midiPath,
    wavPath,
    configPath,
    soundfontStack: result.soundfontStack,
    config: result.config,
  };
}

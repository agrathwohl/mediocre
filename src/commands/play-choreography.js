/**
 * @fileoverview Play choreography command - plays audio with synchronized ASCII animations
 * Wraps play-ascii-beats-enhanced.js and play-choreography-v1.1.js functionality
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import AudioAnalyzer from '../utils/audio-analyzer.js';
import FrequencyAnalyzer from '../utils/frequency-analyzer.js';
import asciiArtManager from '../utils/ascii-art-manager.js';
import { getProjectRoot } from '../utils/paths.js';
import { validateFileExists } from '../utils/file-validators.js';
import { spawnNode, handleProcessError } from '../utils/process-helpers.js';

const PROJECT_ROOT = getProjectRoot(import.meta.url);

/**
 * Create the play-choreography command for the CLI
 * @returns {Command} Commander command instance
 */
export function createPlayChoreographyCommand() {
  const command = new Command('play-choreography');

  command
    .description('Play audio with synchronized ASCII choreography visualization')
    .argument('<audio-file>', 'Audio file to play (WAV, MP3, FLAC, etc)')
    .option('-c, --choreography <file>', 'Choreography JSON file (v1.0 or v1.1 format)')
    .option('-a, --abc <file>', 'ABC notation file for auto-loading ASCII art')
    .option('-m, --mode <mode>', 'Visualization mode (standard, enhanced, v11)', 'enhanced')
    .option('--no-osd', 'Hide on-screen display')
    .option('-v, --volume <level>', 'Volume level (0-100)', '100')
    .option('--fps <number>', 'Target frames per second', '30')
    .option('--analyze-only', 'Only analyze audio without playback')
    .addHelpText('after', `
Visualization Modes:
  standard   - Basic ASCII beat visualization
  enhanced   - Full-featured with collisions, transformations, colors
  v11        - Choreography v1.1 format with scenes, threads, formations

Features:
  - Real audio analysis using FFmpeg/Sox/Aubio
  - Frequency band visualization (bass, mid, treble)
  - Multi-object collision detection and transformations
  - JSON choreography support for scripted animations
  - ASCII art library integration

Examples:
  $ mediocre play-choreography output/song.wav
  $ mediocre play-choreography output/song.wav -c output/song.choreography.json
  $ mediocre play-choreography output/song.wav --mode v11 -c output/song.v11.json
  $ mediocre play-choreography output/song.wav -a output/song.abc
  $ mediocre play-choreography output/song.wav --analyze-only
    `)
    .action(async (audioFile, options) => {
      await playChoreography(audioFile, options);
    });

  return command;
}

/**
 * Play audio with choreography visualization
 * @param {string} audioFile - Path to audio file
 * @param {Object} options - Command options
 */
async function playChoreography(audioFile, options) {
  // Validate audio file exists
  try {
    validateFileExists(audioFile, 'Audio file');
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  console.log('\n🎭 MEDIOCRE CHOREOGRAPHY PLAYER');
  console.log('════════════════════════════════\n');

  // Handle analyze-only mode
  if (options.analyzeOnly) {
    await analyzeAudio(audioFile, options);
    return;
  }

  // Determine which player to use based on mode and options
  if (options.mode === 'v11' || (options.choreography && isV11Format(options.choreography))) {
    await playWithV11Engine(audioFile, options);
  } else {
    await playWithEnhancedEngine(audioFile, options);
  }
}

/**
 * Check if choreography file is v1.1 format
 * @param {string} choreographyFile - Path to choreography JSON
 * @returns {boolean}
 */
function isV11Format(choreographyFile) {
  if (!fs.existsSync(choreographyFile)) return false;

  try {
    const data = JSON.parse(fs.readFileSync(choreographyFile, 'utf8'));
    return data.metadata?.version?.startsWith('1.1') ||
           data.threads !== undefined ||
           data.scenes !== undefined;
  } catch {
    return false;
  }
}

/**
 * Analyze audio and display results
 * @param {string} audioFile - Path to audio file
 * @param {Object} options - Command options
 */
async function analyzeAudio(audioFile, options) {
  console.log(`🎵 Analyzing: ${path.basename(audioFile)}\n`);

  const fps = parseInt(options.fps) || 30;

  // Extract amplitude data
  console.log('📊 Extracting amplitude data...');
  const audioAnalyzer = new AudioAnalyzer(audioFile, {
    sampleRate: fps,
    method: 'sox'
  });

  const amplitudes = await audioAnalyzer.extractAmplitudes();
  const duration = amplitudes.length / fps;

  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log(`   Samples: ${amplitudes.length}`);
  console.log(`   Average amplitude: ${(amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length).toFixed(3)}`);
  console.log(`   Peak amplitude: ${Math.max(...amplitudes).toFixed(3)}`);

  // Extract frequency bands
  console.log('\n🎛️  Extracting frequency bands...');
  try {
    const freqAnalyzer = new FrequencyAnalyzer(audioFile, { sampleRate: fps });
    const { frequencyBands, onsets } = await freqAnalyzer.analyze();

    console.log(`   Frequency samples: ${frequencyBands.length}`);
    console.log(`   Detected onsets: ${onsets.length}`);

    if (frequencyBands.length > 0) {
      const avgBass = frequencyBands.reduce((a, b) => a + b.bass, 0) / frequencyBands.length;
      const avgMid = frequencyBands.reduce((a, b) => a + b.mid, 0) / frequencyBands.length;
      const avgTreble = frequencyBands.reduce((a, b) => a + b.treble, 0) / frequencyBands.length;

      console.log(`\n   Average frequency bands:`);
      console.log(`     Bass:   ${avgBass.toFixed(3)}`);
      console.log(`     Mid:    ${avgMid.toFixed(3)}`);
      console.log(`     Treble: ${avgTreble.toFixed(3)}`);
    }
  } catch (error) {
    console.log(`   ⚠️  Frequency analysis requires aubio tools`);
    console.log(`      Install: sudo apt-get install aubio-tools`);
  }

  console.log('\n✅ Analysis complete');
}

/**
 * Play with v1.1 choreography engine
 * @param {string} audioFile - Path to audio file
 * @param {Object} options - Command options
 */
async function playWithV11Engine(audioFile, options) {
  const scriptPath = path.join(PROJECT_ROOT, 'play-choreography-v1.1.js');

  if (!fs.existsSync(scriptPath)) {
    console.error(`❌ V1.1 engine not found: ${scriptPath}`);
    console.error('   Falling back to enhanced mode...');
    await playWithEnhancedEngine(audioFile, options);
    return;
  }

  if (!options.choreography) {
    console.error('❌ V1.1 mode requires a choreography file (-c option)');
    process.exit(1);
  }

  try {
    validateFileExists(options.choreography, 'Choreography file');
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  console.log(`🎬 Mode: Choreography v1.1`);
  console.log(`🎵 Audio: ${path.basename(audioFile)}`);
  console.log(`📜 Choreography: ${path.basename(options.choreography)}`);
  console.log();

  const args = [audioFile, options.choreography];
  if (!options.osd) {
    args.push('--no-osd');
  }

  try {
    await spawnNode(scriptPath, args);
  } catch (error) {
    handleProcessError(error, 'Playback');
  }
}

/**
 * Play with enhanced ASCII beats engine
 * @param {string} audioFile - Path to audio file
 * @param {Object} options - Command options
 */
async function playWithEnhancedEngine(audioFile, options) {
  const scriptPath = path.join(PROJECT_ROOT, 'play-ascii-beats-enhanced.js');

  try {
    validateFileExists(scriptPath, 'Enhanced engine');
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  console.log(`🎬 Mode: Enhanced ASCII Beats`);
  console.log(`🎵 Audio: ${path.basename(audioFile)}`);
  if (options.choreography) {
    console.log(`📜 Choreography: ${path.basename(options.choreography)}`);
  }
  if (options.abc) {
    console.log(`🎼 ABC: ${path.basename(options.abc)}`);
  }
  console.log();

  const args = [audioFile];

  if (options.choreography) {
    args.push('--choreography', options.choreography);
  }

  if (options.abc) {
    args.push('--abc', options.abc);
  }

  try {
    await spawnNode(scriptPath, args);
  } catch (error) {
    handleProcessError(error, 'Playback');
  }
}

export default createPlayChoreographyCommand;

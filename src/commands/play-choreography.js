#!/usr/bin/env node

/**
 * Play Choreography Command
 * 
 * Plays audio files with choreographed ASCII art visualization.
 * Uses the modular playback system for rendering and choreography management.
 * 
 * Features:
 * - Real-time audio analysis (audiowaveform)
 * - Choreography-based ASCII art visualization
 * - On-screen display (OSD) with playback info
 * - Custom ASCII art from ABC notation files
 * - Screen recording mode (gpu-screen-recorder)
 * - Title card and description display
 * 
 * @module commands/play-choreography
 * 
 * @example
 * mediocre play-choreography audio.wav choreography.json
 * mediocre play-choreography audio.wav --osd
 * mediocre play-choreography audio.wav --record
 * mediocre play-choreography audio.wav --no-title --no-descript
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { execa } from 'execa';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import playback modules
import { ChoreographyManager } from '../playback/choreography/choreography-manager.js';
import { RenderManager } from '../playback/rendering/render-manager.js';
import { ColorSystem } from '../playback/core/color-system.js';
import { ObjectPool } from '../playback/core/object-pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load choreography data from JSON file
 * @param {string} choreographyPath - Path to choreography JSON file
 * @returns {Object} Choreography data
 */
async function loadChoreography(choreographyPath) {
  let content;
  try {
    content = await fs.promises.readFile(choreographyPath, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`Choreography file not found: ${choreographyPath}`);
    }
    throw e;
  }

  const data = JSON.parse(content);
  // Validate minimum structure
  if (!data.timeline || !Array.isArray(data.timeline)) {
    throw new Error('Invalid choreography: missing timeline array');
  }
  if (!data.templates || !data.templates.objects) {
    throw new Error('Invalid choreography: missing templates.objects');
  }
  return data;
}

/**
 * Check if audiowaveform is available
 * @returns {boolean} True if audiowaveform is available
 */
async function hasAudiowaveform() {
  try {
    await execa('which', ['audiowaveform']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Analyze audio file using audiowaveform
 * @param {string} audioPath - Path to audio file
 * @param {number} sampleRate - Samples per second
 * @returns {Promise<{samples: number[], duration: number}>} Audio samples and duration
 */
async function analyzeAudio(audioPath, sampleRate = 30) {
  if (!(await hasAudiowaveform())) {
    throw new Error('audiowaveform not found. Install with: nix-shell -p audiowaveform');
  }
  return new Promise((resolve, reject) => {
    // Use audiowaveform to get amplitude data
    const pixels = Math.ceil(44100 * 60 / sampleRate); // Estimate for 60s max, will adjust
    
    const proc = spawn('audiowaveform', [
      '-i', audioPath,
      '--pixels-per-second', sampleRate.toString(),
      '--output-format', 'json',
      '-b', '8'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`audiowaveform failed: ${errorOutput || 'exit code ' + code}`));
        return;
      }

      try {
        const data = JSON.parse(output);
        const samples = data.data || [];
        
        // Normalize samples to 0-1 range (audiowaveform outputs -128 to 127 for 8-bit)
        const normalized = samples.map(s => (Math.abs(s) / 128));
        
        // Calculate duration from samples
        const duration = normalized.length / sampleRate;
        
        resolve({ samples: normalized, duration });
      } catch (error) {
        reject(new Error(`Failed to parse audiowaveform output: ${error.message}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Calculate velocities (rate of change) and onsets from amplitude samples
 * @param {number[]} samples - Amplitude samples
 * @param {number} sampleRate - Samples per second
 * @returns {{velocities: number[], onsets: Array}} Velocities and detected onsets
 */
function calculateAudioFeatures(samples, sampleRate = 30) {
  const velocities = [0]; // First velocity is 0
  const onsets = [];

  for (let i = 1; i < samples.length; i++) {
    const velocity = Math.abs(samples[i] - samples[i - 1]);
    velocities.push(velocity);

    // Detect onset when amplitude increases significantly
    if (samples[i] > samples[i - 1] * 1.3 && samples[i] > 0.2) {
      onsets.push({
        index: i,
        time: i / sampleRate,
        strength: samples[i],
        velocity: velocity
      });
    }
  }

  return { velocities, onsets };
}

/**
 * Check for custom ASCII art from ABC notation files
 * @param {string} audioPath - Path to audio file
 * @returns {Object|null} Custom art data or null
 */
async function getCustomAsciiArt(audioPath) {
  // Check if there's an associated ABC file
  const audioDir = path.dirname(audioPath);
  const audioBasename = path.basename(audioPath, path.extname(audioPath));
  const possibleAbcPaths = [
    path.join(audioDir, `${audioBasename}.abc`),
    path.join(audioDir, audioBasename.replace(/-choreography$/, '') + '.abc'),
    path.join(audioDir, audioBasename.replace(/_final$/, '') + '.abc'),
  ];
  for (const abcPath of possibleAbcPaths) {
    try {
      const abcContent = await fs.promises.readFile(abcPath, 'utf-8');
        // Extract metadata
      const titleMatch = abcContent.match(/T:(.+)/);
        const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
      const artMatches = abcContent.match(/% ASCII_ART:\s*(.+)/g);
      if (artMatches) {
        return {
          abcBasename: path.basename(abcPath, '.abc'),
          title,
          shapes: artMatches.map(m => m.replace(/% ASCII_ART:\s*/, '').trim()),
          metadata: { title }
        };
      }
    } catch (error) {
      // Continue to next possible path (file doesn't exist or read error)
    }
  }
  return null;
}

/**
 * Log choreography preview
 * @param {ChoreographyManager} manager - Choreography manager
 */
function logChoreographyPreview(manager) {
  const stats = manager.getStats();
  
  console.log(chalk.gray('\n  Choreography Preview:'));
  console.log(chalk.gray(`  • ${stats.events.totalTimelineEvents} timeline events`));
  console.log(chalk.gray(`  • ${stats.events.totalBackgroundEvents} background events`));
  console.log(chalk.gray(`  • ${Object.keys(manager.data?.templates?.objects || {}).length} object templates`));
  
  // Show first few events
  const events = manager.data?.timeline || [];
  if (events.length > 0) {
    console.log(chalk.gray('\n  First 3 events:'));
    events.slice(0, 3).forEach((event, i) => {
      const time = event.trigger?.type === 'time' ? `@${event.trigger.at}s` : 
                   event.trigger?.type === 'beat' ? `beat ${event.trigger.measure}.${event.trigger.beat}` :
                   event.trigger?.type || 'unknown';
      const actions = event.actions?.map(a => a.type).join(', ') || 'none';
      console.log(chalk.gray(`    ${i + 1}. ${time}: ${actions}`));
    });
  }
}

/**
 * Start screen recording with gpu-screen-recorder
 * @param {string} audioFile - Audio file being played
 * @param {string} outputDir - Output directory for recording
 * @returns {Promise<{process: ChildProcess, outputFile: string}>} Recording process and output file
 */
async function startScreenRecording(audioFile, outputDir = './recordings') {
  // Create recordings directory if it doesn't exist
  await fs.promises.mkdir(outputDir, { recursive: true });

  const timestamp = Date.now();
  const audioBasename = path.basename(audioFile, path.extname(audioFile));
  const recordingOutputFile = path.join(outputDir, `${audioBasename}-recording-${timestamp}.mkv`);
  const logFile = path.join(outputDir, `${audioBasename}-recording-${timestamp}.log`);

  // Detect audio device (default to pulse)
  const audioDevice = 'default';

  console.log(chalk.blue(`\n🔴 Starting screen recording...`));
  console.log(chalk.gray(`   Output: ${recordingOutputFile}`));

  const recorderArgs = [
    '-w', 'portal',            // Desktop portal (user selects window)
    '-f', '60',                // 60fps
    '-k', 'h264',              // H.264 codec
    '-bm', 'cbr',              // Constant bitrate mode
    '-q', '25000',             // 25 Mbps
    '-keyint', '60',           // Keyframe every 60 frames
    '-a', audioDevice,         // Audio device
    '-ac', 'opus',             // Opus audio codec
    '-ab', '510',              // Audio bitrate 510kbps
    '-c', 'mkv',               // Matroska container
    '-o', recordingOutputFile  // Output file
  ];

  const recorderProcess = spawn('gpu-screen-recorder', recorderArgs);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  logStream.write(`=== gpu-screen-recorder started at ${new Date().toISOString()} ===\n`);
  logStream.write(`Window: portal (user will select window)\n`);
  logStream.write(`Audio device: ${audioDevice}\n`);
  logStream.write(`Command: gpu-screen-recorder ${recorderArgs.join(' ')}\n\n`);

  console.log(chalk.gray(`   🪟 Desktop portal - select the terminal window`));
  console.log(chalk.gray(`   🔊 Audio: ${audioDevice}`));

  // Capture output to log
  recorderProcess.stderr.on('data', (data) => {
    logStream.write(`[STDERR] ${data.toString()}`);
  });

  recorderProcess.stdout.on('data', (data) => {
    logStream.write(`[STDOUT] ${data.toString()}`);
  });

  recorderProcess.on('error', (err) => {
    logStream.write(`[ERROR] ${err.message}\n`);
    throw new Error(`Recording failed to start: ${err.message}`);
  });

  recorderProcess.on('exit', (code) => {
    logStream.write(`\n=== gpu-screen-recorder exited with code ${code} at ${new Date().toISOString()} ===\n`);
    logStream.end();
  });

  // Wait for user to select window
  console.log(chalk.yellow(`\n⏳ Waiting for window selection (10 seconds)...`));
  await new Promise((resolve, reject) => {
    const startWaitTime = Date.now();
    const checkInterval = setInterval(() => {
      if (!recorderProcess || recorderProcess.killed) {
        clearInterval(checkInterval);
        reject(new Error('Recording failed to start'));
        return;
      }

      if (Date.now() - startWaitTime > 10000) {
        clearInterval(checkInterval);
        console.log(chalk.green(`   ✓ Window selected, starting playback\n`));
        resolve();
      }
    }, 100);
  });

  return { process: recorderProcess, outputFile: recordingOutputFile };
}

/**
 * Play audio file with choreography visualization
 * @param {Object} options - Command options
 * @param {string} options.audio - Path to audio file
 * @param {string} [options.choreography] - Path to choreography JSON file
 * @param {boolean} [options.osd] - Show on-screen display
 * @param {boolean} [options.noTitle] - Skip title card
 * @param {boolean} [options.noDescript] - Skip description
 * @param {boolean} [options.record] - Enable screen recording
 */
export async function playChoreography(options) {
  const { 
    audio, 
    choreography, 
    osd = false, 
    noTitle = false, 
    noDescript = false,
    record = false 
  } = options;

  // Validate audio file
  try {
    await fs.promises.access(audio);
  } catch {
    throw new Error(`Audio file not found: ${audio}`);
  }

  // Auto-detect choreography file if not provided
  let choreographyPath = choreography;
  if (!choreographyPath) {
    const baseName = path.basename(audio, path.extname(audio));
    const dir = path.dirname(audio);
    const possiblePaths = [
      path.join(dir, `${baseName}-choreography.json`),
      path.join(dir, `${baseName}.json`),
      path.join('./output', `${baseName}-choreography.json`),
      path.join('./output', `${baseName}.json`),
    ];

    for (const possiblePath of possiblePaths) {
      try {
        await fs.promises.access(possiblePath);
        choreographyPath = possiblePath;
        console.log(chalk.gray(`Auto-detected choreography: ${choreographyPath}`));
        break;
      } catch {
        // File doesn't exist, try next
      }
    }

    if (!choreographyPath) {
      throw new Error('No choreography file provided and auto-detection failed. Please provide a choreography JSON file path.');
    }
  }

  // Load choreography data
  let choreographyData;
  try {
    choreographyData = await loadChoreography(choreographyPath);
  } catch (error) {
    throw new Error(`Failed to load choreography: ${error.message}`);
  }

  console.log(chalk.green(`🎭 Loaded choreography: ${choreographyData.metadata?.name || choreographyData.metadata?.title || 'Untitled'}`));
  console.log(chalk.gray(`   Duration: ${choreographyData.metadata?.duration || 'unknown'}s`));
  console.log(chalk.gray(`   BPM: ${choreographyData.metadata?.bpm || 'N/A'}`));
  console.log(chalk.gray(`   Timeline: ${choreographyData.timeline?.length || 0} events`));
  console.log(chalk.gray(`   Background: ${choreographyData.backgroundEvents?.length || 0} events`));

  // Display timeline events
  if (choreographyData.timeline && choreographyData.timeline.length > 0) {
    console.log(chalk.cyan('\n📋 Timeline Events:'));
    choreographyData.timeline.forEach((event, i) => {
      const time = event.trigger?.type === 'time' ? `@${event.trigger.at}s` : 
                   event.trigger?.type === 'beat' ? `beat ${event.trigger.measure}.${event.trigger.beat}` :
                   event.trigger?.type || 'unknown';
      const actions = event.actions?.map(a => a.type).join(', ') || 'none';
      const label = event.label ? chalk.gray(` (${event.label})`) : '';
      console.log(chalk.white(`  ${String(i + 1).padStart(3)}. ${chalk.yellow(time.padEnd(12))} ${chalk.green(actions)}${label}`));
    });
  }

  // Display background events
  if (choreographyData.backgroundEvents && choreographyData.backgroundEvents.length > 0) {
    console.log(chalk.cyan('\n🎨 Background Events:'));
    choreographyData.backgroundEvents.forEach((event, i) => {
      const time = event.trigger?.type === 'time' ? `@${event.trigger.at}s` : 'unknown';
      const actions = event.actions?.map(a => `${a.type}:${a.mode || 'default'}`).join(', ') || 'none';
      const label = event.label ? chalk.gray(` (${event.label})`) : '';
      console.log(chalk.white(`  ${String(i + 1).padStart(3)}. ${chalk.yellow(time.padEnd(12))} ${chalk.green(actions)}${label}`));
    });
  }

  // Analyze audio
  console.log(chalk.blue('\n🎵 Analyzing audio...'));
  let audioAnalysis;
  try {
    audioAnalysis = await analyzeAudio(audio, 30);
    console.log(chalk.green(`   ✓ Analyzed ${audioAnalysis.samples.length} samples (${audioAnalysis.duration.toFixed(2)}s)`));
    
    // Update metadata with actual duration
    choreographyData.metadata = choreographyData.metadata || {};
    choreographyData.metadata.duration = audioAnalysis.duration;
  } catch (error) {
    console.warn(chalk.yellow(`   ⚠ Audio analysis failed: ${error.message}`));
    console.warn(chalk.yellow(`   Using fallback timing`));
    audioAnalysis = { samples: [], duration: choreographyData.metadata?.duration || 60 };
  }

  // Calculate audio features
  const { velocities, onsets } = calculateAudioFeatures(audioAnalysis.samples, 30);
  console.log(chalk.gray(`   Detected ${onsets.length} onsets`));

  // Check for custom ASCII art
  const customArt = await getCustomAsciiArt(audio);
  if (customArt) {
    console.log(chalk.blue(`\n🎨 Custom ASCII art found for: ${customArt.title}`));
    console.log(chalk.gray(`   Shapes: ${customArt.shapes.length}`));
  }

  // Initialize playback systems
  const renderManager = new RenderManager(choreographyData.settings);
  const choreographyManager = new ChoreographyManager(
    choreographyData,
    renderManager,
    50
  );

  // Log choreography preview
  logChoreographyPreview(choreographyManager);

  // Start screen recording if enabled
  let recorderProcess = null;
  if (record) {
    try {
      const recording = await startScreenRecording(audio);
      recorderProcess = recording.process;
    } catch (error) {
      throw new Error(`Screen recording failed: ${error.message}`);
    }
  }

  // Clear terminal and show title
  console.clear();

  if (!noTitle && choreographyData.metadata) {
    console.log(chalk.bold.cyan('\n' + '='.repeat(60)));
    const title = choreographyData.metadata.title || choreographyData.metadata.name || 'Untitled';
    console.log(chalk.bold.cyan('  ' + title));
    console.log(chalk.bold.cyan('='.repeat(60)));

    if (!noDescript && choreographyData.metadata.description) {
      console.log(chalk.gray('\n' + choreographyData.metadata.description));
    }

    console.log();
    
    // Small delay for title visibility
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.clear();
  }

  // Start audio playback with mpv
  const mpv = spawn('mpv', [
    audio,
    '--no-video',
    '--really-quiet',
    '--volume=100'
  ]);

  mpv.on('error', (err) => {
    console.error(chalk.red(`\n❌ Error starting audio playback: ${err.message}`));
    console.error(chalk.yellow('Make sure mpv is installed'));
    if (recorderProcess) recorderProcess.kill();
    process.exit(1);
  });

  // Start choreography
  choreographyManager.start();
  const startTime = Date.now();

  console.log(chalk.green('▶ Playback started'));
  console.log(chalk.gray('  Press Ctrl+C to stop\n'));

  // Main animation loop
  let lastFrameTime = startTime;
  let currentSampleIndex = 0;

  const animationLoop = () => {
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;
    const deltaTime = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // Check if playback should end
    if (elapsed >= audioAnalysis.duration) {
      renderManager.clear();
      console.log(chalk.green('\n✓ Playback complete'));
      mpv.kill();
      if (recorderProcess) recorderProcess.kill();
      return;
    }

    // Get current audio sample
    currentSampleIndex = Math.floor(elapsed * 30);
    const amplitude = audioAnalysis.samples[currentSampleIndex] || 0;
    const velocity = velocities[currentSampleIndex] || 0;

    // Update choreography
    const state = choreographyManager.update(deltaTime, { amplitude, velocity });

    // Render frame
    renderManager.render(state.objects, amplitude, elapsed, osd);

    // Continue loop
    setImmediate(animationLoop);
  };

  // Handle interrupt
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n⚠ Playback interrupted'));
    renderManager.clear();
    mpv.kill();
    if (recorderProcess) recorderProcess.kill();
    process.exit(0);
  });

  // Start animation loop
  animationLoop();
}

export default playChoreography;

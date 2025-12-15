/**
 * @fileoverview Playlist command - sequential playback of audio with choreography
 * Supports progress tracking, resume functionality, and auto-discovery of files
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { colors, status } from '../utils/terminal-colors.js';
import { getProjectRoot } from '../utils/paths.js';
import { spawnNode, handleProcessError } from '../utils/process-helpers.js';
import { validateFileExists, cleanTrackName } from '../utils/file-validators.js';

const PROJECT_ROOT = getProjectRoot(import.meta.url);

/**
 * Create the playlist command for the CLI
 * @returns {Command} Commander command instance
 */
export function createPlaylistCommand() {
  const command = new Command('playlist');

  command
    .description('Play a sequence of audio files with choreography visualization')
    .option('-d, --directory <dir>', 'Directory containing audio files', 'output')
    .option('-p, --playlist <file>', 'JSON playlist file with audio/choreography pairs')
    .option('--pattern <glob>', 'Glob pattern for audio files (e.g., "*.wav")', '*.wav')
    .option('--auto-choreo', 'Auto-discover choreography files for each audio file')
    .option('--delay <seconds>', 'Delay between tracks in seconds', '3')
    .option('--resume', 'Resume from last played track')
    .option('--reset', 'Reset progress and start from beginning')
    .option('--shuffle', 'Randomize playlist order')
    .option('--limit <number>', 'Limit number of tracks to play')
    .option('--list', 'List tracks without playing')
    .option('-q, --quiet', 'Suppress progress messages')
    .addHelpText('after', `
Playlist Sources:
  --directory    Scan directory for audio files matching pattern
  --playlist     Load specific playlist from JSON file

Choreography Discovery:
  When --auto-choreo is enabled, the command looks for choreography files:
  - song.wav → song.choreography.json
  - song.mid.wav → song.choreography.json
  - Searches in same directory and output/ directory

Progress Tracking:
  Progress is saved to .playlist-progress in the current directory.
  Use --resume to continue from where you left off.
  Use --reset to start over.

Playlist JSON Format:
  [
    { "audio": "path/to/song.wav", "choreography": "path/to/song.choreography.json" },
    { "audio": "path/to/another.wav" }
  ]

Examples:
  $ mediocre playlist -d output/maximum-overkill --auto-choreo
  $ mediocre playlist -p my-playlist.json
  $ mediocre playlist -d output --pattern "*.mid.wav" --auto-choreo
  $ mediocre playlist -d output --shuffle --limit 10
  $ mediocre playlist --resume
  $ mediocre playlist -d output --list
    `)
    .action(async (options) => {
      await runPlaylist(options);
    });

  return command;
}

/**
 * Find choreography file for an audio file
 * @param {string} audioFile - Path to audio file
 * @returns {string|null} Path to choreography file or null
 */
function findChoreographyFile(audioFile) {
  const dir = path.dirname(audioFile);
  const basename = path.basename(audioFile);

  // Try different naming patterns
  const patterns = [
    // Direct match: song.wav → song.choreography.json
    basename.replace(/\.(wav|mp3|flac|ogg)$/i, '.choreography.json'),
    // MIDI conversion: song.mid.wav → song.choreography.json
    basename.replace(/\.mid\.(wav|mp3|flac|ogg)$/i, '.choreography.json'),
    // With score suffix: song-score1-123.mid.wav → song-score1-123.choreography.json
    basename.replace(/\.(wav|mp3|flac|ogg)$/i, '').replace(/\.mid$/, '') + '.choreography.json'
  ];

  // Search locations
  const searchDirs = [
    dir,
    path.join(PROJECT_ROOT, 'output'),
    PROJECT_ROOT
  ];

  for (const searchDir of searchDirs) {
    for (const pattern of patterns) {
      const choreoPath = path.join(searchDir, pattern);
      if (fs.existsSync(choreoPath)) {
        return choreoPath;
      }
    }
  }

  return null;
}

/**
 * Load playlist from various sources
 * @param {Object} options - Command options
 * @returns {Array} Array of {audio, choreography} objects
 */
function loadPlaylist(options) {
  let playlist = [];

  // Load from JSON file
  if (options.playlist) {
    if (!fs.existsSync(options.playlist)) {
      console.error(`${colors.red}❌ Playlist file not found: ${options.playlist}${colors.reset}`);
      process.exit(1);
    }

    try {
      const data = JSON.parse(fs.readFileSync(options.playlist, 'utf8'));
      playlist = Array.isArray(data) ? data : data.tracks || [];
    } catch (error) {
      console.error(`${colors.red}❌ Failed to parse playlist: ${error.message}${colors.reset}`);
      process.exit(1);
    }
  }
  // Scan directory
  else if (options.directory) {
    const dir = path.resolve(options.directory);
    if (!fs.existsSync(dir)) {
      console.error(`${colors.red}❌ Directory not found: ${dir}${colors.reset}`);
      process.exit(1);
    }

    // Simple glob matching
    const pattern = options.pattern.replace('*', '');
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith(pattern))
      .map(f => path.join(dir, f))
      .sort();

    playlist = files.map(audio => ({ audio }));

    // Auto-discover choreography files
    if (options.autoChoreo) {
      playlist = playlist.map(item => ({
        ...item,
        choreography: findChoreographyFile(item.audio)
      }));
    }
  }

  // Shuffle if requested
  if (options.shuffle) {
    for (let i = playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
    }
  }

  // Limit if requested
  if (options.limit) {
    playlist = playlist.slice(0, parseInt(options.limit));
  }

  return playlist;
}

/**
 * Get progress file path
 * @returns {string}
 */
function getProgressFile() {
  return path.join(process.cwd(), '.playlist-progress');
}

/**
 * Load progress from file
 * @returns {number} Last played track index (0-based)
 */
function loadProgress() {
  const progressFile = getProgressFile();
  if (fs.existsSync(progressFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      return data.lastPlayed || 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * Save progress to file
 * @param {number} trackIndex - Current track index
 * @param {number} total - Total tracks
 */
function saveProgress(trackIndex, total) {
  const progressFile = getProgressFile();
  fs.writeFileSync(progressFile, JSON.stringify({
    lastPlayed: trackIndex,
    total,
    timestamp: new Date().toISOString()
  }, null, 2));
}

/**
 * Reset progress
 */
function resetProgress() {
  const progressFile = getProgressFile();
  if (fs.existsSync(progressFile)) {
    fs.unlinkSync(progressFile);
  }
}

/**
 * Play a single track
 * @param {Object} track - Track object with audio and choreography paths
 * @param {number} index - Track index
 * @param {number} total - Total tracks
 * @param {boolean} quiet - Suppress output
 * @returns {Promise<boolean>} Success status
 */
async function playTrack(track, index, total, quiet) {
  const trackName = cleanTrackName(track.audio);

  if (!quiet) {
    console.log('');
    console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${status.music} Track ${index + 1}/${total}: ${trackName}`);
    console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  }

  // Verify audio file exists
  try {
    validateFileExists(track.audio, 'Audio file');
  } catch (error) {
    console.error(`${status.error} ${error.message}`);
    return false;
  }

  const scriptPath = path.join(PROJECT_ROOT, 'play-ascii-beats-enhanced.js');
  try {
    validateFileExists(scriptPath, 'Player script');
  } catch (error) {
    console.error(`${status.error} ${error.message}`);
    return false;
  }

  if (!quiet) {
    console.log(`${status.info} Playing: ${path.basename(track.audio)}`);
    if (track.choreography) {
      console.log(`${status.info} Choreography: ${path.basename(track.choreography)}`);
    } else {
      console.log(`${colors.yellow}[i]${colors.reset} No choreography file (using auto-visualization)`);
    }
  }

  const args = [track.audio];
  if (track.choreography && fs.existsSync(track.choreography)) {
    args.push('--choreography', track.choreography);
  }

  try {
    await spawnNode(scriptPath, args);
    if (!quiet) {
      console.log(`${status.success} Successfully played track ${index + 1}`);
    }
    return true;
  } catch (error) {
    if (!handleProcessError(error, 'Track playback')) {
      console.error(`${status.error} Failed to play track ${index + 1}`);
    }
    return false;
  }
}

/**
 * Run the playlist
 * @param {Object} options - Command options
 */
async function runPlaylist(options) {
  // Handle reset
  if (options.reset) {
    resetProgress();
    console.log(`${status.success} Progress reset`);
    if (!options.directory && !options.playlist) {
      return;
    }
  }

  // Load playlist
  const playlist = loadPlaylist(options);

  if (playlist.length === 0) {
    console.error(`${colors.red}❌ No tracks found${colors.reset}`);
    console.log('Use --directory or --playlist to specify tracks');
    process.exit(1);
  }

  // List only mode
  if (options.list) {
    console.log(`\n${colors.cyan}Playlist (${playlist.length} tracks):${colors.reset}\n`);
    playlist.forEach((track, i) => {
      const name = path.basename(track.audio);
      const hasChoreography = track.choreography ? `${colors.green}✓${colors.reset}` : `${colors.yellow}-${colors.reset}`;
      console.log(`  ${(i + 1).toString().padStart(3)}. ${hasChoreography} ${name}`);
    });
    console.log('');
    return;
  }

  // Determine starting point
  let startIndex = 0;
  if (options.resume) {
    startIndex = loadProgress();
    if (startIndex >= playlist.length) {
      startIndex = 0;
    }
    if (startIndex > 0) {
      console.log(`${status.info} Resuming from track ${startIndex + 1}`);
    }
  }

  // Print header
  console.log(`${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║          MEDIOCRE CHOREOGRAPHY PLAYLIST PLAYER            ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`${status.info} Starting playlist with ${playlist.length} tracks`);
  console.log(`${status.info} Press Ctrl+C to pause (progress will be saved)`);

  let successCount = 0;
  let failCount = 0;
  let currentIndex = startIndex;

  // Handle interruption
  const cleanup = () => {
    console.log('');
    console.log(`${status.info} Playlist interrupted at track ${currentIndex + 1}`);
    saveProgress(currentIndex, playlist.length);
    showSummary(successCount, failCount, playlist.length);
    console.log(`${status.info} Progress saved. Run with --resume to continue.`);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Play tracks
  const delay = parseInt(options.delay) * 1000 || 3000;

  for (let i = startIndex; i < playlist.length; i++) {
    currentIndex = i;
    const success = await playTrack(playlist[i], i, playlist.length, options.quiet);

    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    // Save progress after each track
    saveProgress(i + 1, playlist.length);

    // Delay between tracks
    if (i < playlist.length - 1 && !options.quiet) {
      console.log(`${status.info} Next track in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Show final summary
  showSummary(successCount, failCount, playlist.length);
  console.log(`${status.success} Playlist complete!`);

  // Clean up progress if all successful
  if (successCount === playlist.length) {
    resetProgress();
    console.log(`${status.info} Progress file cleaned up`);
  }
}

/**
 * Show playlist summary
 * @param {number} success - Successful plays
 * @param {number} failed - Failed plays
 * @param {number} total - Total tracks
 */
function showSummary(success, failed, total) {
  console.log('');
  console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.cyan}                    PLAYLIST SUMMARY${colors.reset}`);
  console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.green}  Successful plays: ${success}${colors.reset}`);
  console.log(`${colors.red}  Failed plays: ${failed}${colors.reset}`);
  console.log(`${colors.blue}  Total tracks: ${total}${colors.reset}`);
  console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
}

export default createPlaylistCommand;

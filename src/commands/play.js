/**
 * @fileoverview Play command for MIDI playback with soundfont profiles
 * Consolidates play-with-stable.sh, play-with-ultimate.sh functionality
 */

import { Command } from 'commander';
import { execa } from 'execa';
import fs from 'fs';
import path from 'path';
import { getProjectRoot } from '../utils/paths.js';
import { validateFileExists, AUDIO_EXTENSIONS, MIDI_EXTENSIONS } from '../utils/file-validators.js';
import { showToolInstallHelp } from '../utils/tool-checker.js';

const PROJECT_ROOT = getProjectRoot(import.meta.url);

/**
 * Available soundfont profiles with their configurations
 */
const SOUNDFONT_PROFILES = {
  stable: {
    description: 'Stable configuration - 2 soundfonts, no effects (no static)',
    config: 'timidity-stable.cfg'
  },
  ultimate: {
    description: 'Ultimate quality configuration',
    config: 'timidity-ultimate.cfg'
  },
  'ultimate-simple': {
    description: 'Ultimate simplified configuration',
    config: 'timidity-ultimate-simple.cfg'
  },
  overkill: {
    description: 'Maximum overkill configuration',
    config: 'timidity-maximum-overkill.cfg'
  }
};

/**
 * Create the play command for the CLI
 * @returns {Command} Commander command instance
 */
export function createPlayCommand() {
  const command = new Command('play');

  command
    .description('Play MIDI or WAV files with various configurations')
    .argument('<file>', 'Audio or MIDI file to play')
    .option('-p, --profile <name>', 'Soundfont profile (stable, ultimate, ultimate-simple, overkill)', 'stable')
    .option('-v, --volume <level>', 'Volume level (0-100)', '100')
    .option('--list-profiles', 'List available soundfont profiles')
    .option('--mpv', 'Use mpv instead of timidity for WAV files')
    .addHelpText('after', `
Soundfont Profiles:
  stable         - Stable configuration, no static (recommended)
  ultimate       - Ultimate quality configuration
  ultimate-simple - Ultimate simplified configuration
  overkill       - Maximum overkill configuration

Examples:
  $ mediocre play output/song.mid
  $ mediocre play output/song.mid --profile ultimate
  $ mediocre play output/song.wav --mpv
  $ mediocre play --list-profiles
    `)
    .action(async (file, options) => {
      if (options.listProfiles) {
        listProfiles();
        return;
      }
      await playFile(file, options);
    });

  return command;
}

/**
 * List available soundfont profiles
 */
function listProfiles() {
  console.log('\n🎵 Available Soundfont Profiles:\n');
  console.log('Profile'.padEnd(20) + 'Config File'.padEnd(30) + 'Description');
  console.log('-'.repeat(80));

  for (const [name, profile] of Object.entries(SOUNDFONT_PROFILES)) {
    const configPath = path.join(PROJECT_ROOT, profile.config);
    const exists = fs.existsSync(configPath) ? '✓' : '✗';
    console.log(
      `${exists} ${name}`.padEnd(20) +
      profile.config.padEnd(30) +
      profile.description
    );
  }
  console.log();
}

/**
 * Play audio or MIDI file
 * @param {string} file - Path to audio file
 * @param {Object} options - Command options
 */
async function playFile(file, options) {
  // Check if file exists
  try {
    validateFileExists(file, 'File');
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  const ext = path.extname(file).toLowerCase();

  if (MIDI_EXTENSIONS.includes(ext)) {
    await playMidi(file, options);
  } else if (AUDIO_EXTENSIONS.includes(ext)) {
    await playAudio(file, options);
  } else {
    console.error(`❌ Unsupported file type: ${ext}`);
    console.error(`Supported formats: ${[...MIDI_EXTENSIONS, ...AUDIO_EXTENSIONS].join(', ')}`);
    process.exit(1);
  }
}

/**
 * Play MIDI file with timidity
 * @param {string} file - Path to MIDI file
 * @param {Object} options - Command options
 */
async function playMidi(file, options) {
  const profile = SOUNDFONT_PROFILES[options.profile];

  if (!profile) {
    console.error(`❌ Unknown profile: ${options.profile}`);
    console.error(`Available profiles: ${Object.keys(SOUNDFONT_PROFILES).join(', ')}`);
    process.exit(1);
  }

  const configPath = path.join(PROJECT_ROOT, profile.config);

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found: ${configPath}`);
    console.error('Please ensure the timidity configuration file exists.');
    process.exit(1);
  }

  console.log(`🎵 Playing: ${path.basename(file)}`);
  console.log(`🔧 Profile: ${options.profile} (${profile.description})`);
  console.log();

  try {
    // Run timidity with our config, skipping system soundfonts
    // -Os = no system config
    // -c = our config file
    await execa('timidity', ['-Os', '-c', configPath, file], {
      stdio: 'inherit',
      env: { ...process.env }
    });
  } catch (error) {
    if (error.exitCode === 127) {
      showToolInstallHelp('timidity');
      process.exit(1);
    }
    // User interrupted (Ctrl+C) is normal
    if (error.signal !== 'SIGINT') {
      console.error('Playback error:', error.message);
    }
  }
}

/**
 * Play audio file with mpv or default player
 * @param {string} file - Path to audio file
 * @param {Object} options - Command options
 */
async function playAudio(file, options) {
  console.log(`🎵 Playing: ${path.basename(file)}`);
  console.log(`🔊 Volume: ${options.volume}%`);
  console.log();

  try {
    const volume = parseInt(options.volume) || 100;

    await execa('mpv', [
      file,
      '--no-video',
      '--really-quiet',
      `--volume=${volume}`
    ], {
      stdio: 'inherit',
      env: { ...process.env }
    });
  } catch (error) {
    if (error.exitCode === 127) {
      showToolInstallHelp('mpv');
      process.exit(1);
    }
    // User interrupted (Ctrl+C) is normal
    if (error.signal !== 'SIGINT') {
      console.error('Playback error:', error.message);
    }
  }
}

export default createPlayCommand;

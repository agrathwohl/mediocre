/**
 * ASCII Beat Visualizer Command
 * Provides terminal-based audio visualization with beat-synchronized animations
 *
 * NOTE: Currently uses SIMULATED beats at 120 BPM, not actual beat detection
 */

import { Command } from 'commander';
import { execa } from 'execa';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create the visualize command for the CLI
 * @returns {Command} Commander command instance
 */
export function createVisualizeCommand() {
  return new Command('visualize')
    .description('Visualize audio with ASCII beat animations (EXPERIMENTAL)')
    .argument('<file>', 'Audio file to visualize (WAV, MP3, etc)')
    .option('-m, --mode <mode>', 'Visualization mode', 'standard')
    .addHelpText('after', `
Modes:
  simple    - Minimal effects, low CPU usage
  standard  - Balanced effects (default)
  insane    - Maximum visual chaos

WARNING: Beat detection is currently SIMULATED at 120 BPM.
         The visualizations do not sync to actual audio beats.

Requirements:
  - Python 3.13+
  - pygame and asciimatics (install with: uv pip install pygame asciimatics)
  - For NixOS users: enter nix-shell first

Examples:
  $ mediocre visualize output/song.wav
  $ mediocre visualize output/song.wav --mode simple
  $ mediocre visualize output/song.wav --mode insane
    `)
    .action(async (file, options) => {
      await runVisualizer(file, options);
    });
}

/**
 * Run the Python visualizer script
 * @param {string} audioFile - Path to audio file
 * @param {Object} options - Command options
 */
async function runVisualizer(audioFile, options) {
  const scriptPath = path.join(__dirname, '../../scripts/visualizers/ascii-beats.py');

  // Check if script exists
  try {
    await fs.access(scriptPath);
  } catch (error) {
    console.error('Error: Visualizer script not found at:', scriptPath);
    console.error('Make sure you are in the mediocre project directory');
    process.exit(1);
  }

  // Check if audio file exists
  try {
    await fs.access(audioFile);
  } catch (error) {
    console.error(`Error: Audio file not found: ${audioFile}`);
    process.exit(1);
  }

  // Validate mode
  const validModes = ['simple', 'standard', 'insane'];
  if (!validModes.includes(options.mode)) {
    console.error(`Error: Invalid mode '${options.mode}'`);
    console.error(`Valid modes: ${validModes.join(', ')}`);
    process.exit(1);
  }

  console.log('\n🎆 Starting ASCII Beat Visualizer...\n');
  console.log('⚠️  NOTE: Beat detection is SIMULATED at 120 BPM');
  console.log('         Not synced to actual audio beats\n');

  try {
    // Try to run with Python 3
    await execa('python3', [
      scriptPath,
      audioFile,
      '--mode', options.mode
    ], {
      stdio: 'inherit',
      env: { ...process.env }
    });
  } catch (error) {
    if (error.exitCode === 127) {
      console.error('\nError: Python 3 not found');
      console.error('Please install Python 3.13+ and required packages:');
      console.error('  $ pip install pygame asciimatics');
      console.error('\nFor NixOS users:');
      console.error('  $ nix-shell');
      console.error('  $ uv pip install pygame asciimatics');
    } else if (error.signal === 'SIGINT') {
      console.log('\n\n👋 Visualizer stopped by user');
    } else if (error.stderr && error.stderr.includes('ModuleNotFoundError')) {
      console.error('\nError: Python packages not installed');
      console.error('Install required packages:');
      console.error('  $ pip install pygame asciimatics');
      console.error('Or with uv:');
      console.error('  $ uv pip install pygame asciimatics');
    } else if (error.message) {
      console.error(`\nVisualizer error: ${error.message}`);
      if (error.stderr) {
        console.error('Details:', error.stderr);
      }
    }
    process.exit(1);
  }
}

export default createVisualizeCommand;
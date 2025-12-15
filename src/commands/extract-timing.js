/**
 * @fileoverview Command to extract timing data from ABC files for ASCII animation
 */

import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import {
  extractTimingMap,
  generateAnimationMap,
  exportTimingMap,
  createSimplifiedAnimationData
} from '../utils/abc-timing-extractor.js';

/**
 * Create the extract-timing command
 * @returns {Command} Commander command instance
 */
export function createExtractTimingCommand() {
  const command = new Command('extract-timing');

  command
    .description('Extract timing data from ABC files for ASCII animation synchronization')
    .argument('<abc-file>', 'Path to ABC file')
    .option('-o, --output <path>', 'Output path for timing map', './timing-map.json')
    .option('-f, --fps <number>', 'Frames per second for animation map', '30')
    .option('-s, --simplified', 'Generate simplified animation data', false)
    .option('-a, --ascii-map', 'Generate ASCII visualization map', false)
    .option('-v, --verbose', 'Verbose output', false)
    .action(async (abcFile, options) => {
      await extractTiming(abcFile, options);
    });

  return command;
}

/**
 * Extract timing data from ABC file
 * @param {string} abcFile - Path to ABC file
 * @param {Object} options - Command options
 */
async function extractTiming(abcFile, options) {
  try {
    console.log(chalk.cyan('🎵 Extracting timing data from ABC file...'));

    // Read ABC file
    const abcContent = await fs.readFile(abcFile, 'utf-8');
    console.log(chalk.green(`✓ Loaded ABC file: ${abcFile}`));

    // Extract timing map
    console.log(chalk.cyan('⏱️  Parsing note timings...'));
    const timingMap = extractTimingMap(abcContent);

    if (options.verbose) {
      console.log(chalk.gray('Metadata:'));
      console.log(chalk.gray(`  Tempo: ${JSON.stringify(timingMap.metadata.tempo)}`));
      console.log(chalk.gray(`  Time Signature: ${timingMap.metadata.timeSignature}`));
      console.log(chalk.gray(`  Total Duration: ${timingMap.metadata.totalDuration.toFixed(2)}s`));
      console.log(chalk.gray(`  Voices: ${timingMap.metadata.voices.length}`));
      timingMap.metadata.voices.forEach(v => {
        console.log(chalk.gray(`    - ${v.voice}: ${v.name}`));
      });
      console.log(chalk.gray(`  Total Events: ${timingMap.events.length}`));
      console.log(chalk.gray(`  Measures: ${timingMap.measures.length}`));
    }

    // Generate output based on options
    let outputData = timingMap;
    let outputFile = options.output;

    if (options.simplified) {
      console.log(chalk.cyan('📊 Generating simplified animation data...'));
      outputData = createSimplifiedAnimationData(timingMap);
      if (!options.output.includes('simplified')) {
        outputFile = outputFile.replace('.json', '.simplified.json');
      }
    }

    if (options.asciiMap) {
      console.log(chalk.cyan('🎨 Generating ASCII visualization map...'));
      const asciiMap = generateAsciiVisualizationMap(timingMap);
      const asciiFile = outputFile.replace('.json', '.ascii.txt');
      await fs.writeFile(asciiFile, asciiMap, 'utf-8');
      console.log(chalk.green(`✓ ASCII map saved to: ${asciiFile}`));
    }

    // Export timing map
    await exportTimingMap(outputData, outputFile);
    console.log(chalk.green(`✓ Timing map saved to: ${outputFile}`));

    // Generate animation frames if requested
    if (options.fps) {
      const fps = parseInt(options.fps);
      console.log(chalk.cyan(`🎬 Generating animation map at ${fps} FPS...`));
      const animationMap = generateAnimationMap(timingMap, fps);

      const animationFile = outputFile.replace('.json', `.frames-${fps}fps.json`);
      await fs.writeFile(
        animationFile,
        JSON.stringify(animationMap, null, 2),
        'utf-8'
      );
      console.log(chalk.green(`✓ Animation frames saved to: ${animationFile}`));
      console.log(chalk.gray(`  Total frames: ${animationMap.length}`));
    }

    // Print summary
    console.log(chalk.cyan('\n📋 Summary:'));
    console.log(chalk.white(`  Duration: ${timingMap.metadata.totalDuration.toFixed(2)} seconds`));
    console.log(chalk.white(`  BPM: ${timingMap.metadata.tempo.bpm || 120}`));
    console.log(chalk.white(`  Events: ${timingMap.events.length} musical events`));
    console.log(chalk.white(`  Voices: ${Object.keys(timingMap.voiceData).length} voices`));

    // Create example animation script
    if (options.asciiMap) {
      await createAnimationScript(outputFile, abcFile);
    }

  } catch (error) {
    console.error(chalk.red('✗ Error extracting timing:'), error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Generate ASCII visualization map
 * @param {Object} timingMap - Timing map object
 * @returns {string} ASCII visualization
 */
function generateAsciiVisualizationMap(timingMap) {
  let output = '# ASCII Timing Visualization Map\n';
  output += `# Duration: ${timingMap.metadata.totalDuration.toFixed(2)}s\n`;
  output += `# BPM: ${timingMap.metadata.tempo.bpm || 120}\n`;
  output += `# Voices: ${timingMap.metadata.voices.map(v => v.name).join(', ')}\n`;
  output += '#\n';
  output += '# Time | Voice Activity Map\n';
  output += '# ----+' + '-'.repeat(timingMap.metadata.voices.length * 10) + '\n';

  // Sample every 100ms
  const sampleRate = 0.1;
  const samples = Math.ceil(timingMap.metadata.totalDuration / sampleRate);

  for (let i = 0; i < samples; i++) {
    const time = i * sampleRate;
    const timeStr = time.toFixed(1).padStart(5, ' ');
    let line = `${timeStr} |`;

    // Check each voice for activity
    timingMap.metadata.voices.forEach((voice, idx) => {
      const voiceEvents = timingMap.voiceData[voice.voice].events;
      const activeEvent = voiceEvents.find(e =>
        time >= e.startTime && time < e.endTime
      );

      if (activeEvent) {
        if (activeEvent.type === 'rest') {
          line += ' .        ';
        } else if (activeEvent.type === 'chord') {
          line += ' [#####]  ';
        } else {
          // Show pitch with intensity
          const intensity = Math.floor(((time - activeEvent.startTime) / activeEvent.duration) * 5);
          const char = '▁▂▃▄▅█'[5 - intensity] || '█';
          const pitch = activeEvent.pitch || '?';
          line += ` ${pitch}${char}      `.slice(0, 10);
        }
      } else {
        line += '          ';
      }
    });

    output += line + '\n';
  }

  return output;
}

/**
 * Create animation script
 * @param {string} timingMapFile - Path to timing map file
 * @param {string} abcFile - Path to ABC file
 */
async function createAnimationScript(timingMapFile, abcFile) {
  const scriptContent = `#!/usr/bin/env node

/**
 * ASCII Music Animation Player
 * Auto-generated script to play ASCII animation synchronized with MIDI
 */

import fs from 'fs/promises';
import { spawn } from 'child_process';
import readline from 'readline';

const TIMING_MAP = '${timingMapFile}';
const MIDI_FILE = '${abcFile.replace('.abc', '.mid')}';

// Load timing map
const timingMap = JSON.parse(await fs.readFile(TIMING_MAP, 'utf-8'));

// Setup terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Hide cursor
process.stdout.write('\\x1B[?25l');

// Clear screen
console.clear();

// Start MIDI playback (requires timidity or similar)
const player = spawn('timidity', [MIDI_FILE, '-Ow', '-o', '-'], {
  stdio: ['pipe', 'pipe', 'ignore']
});

// Animation loop
let frameIndex = 0;
const fps = 30;
const frameInterval = 1000 / fps;

const animate = () => {
  const currentTime = frameIndex * (1 / fps);

  // Clear previous frame
  process.stdout.write('\\x1B[H'); // Move to top

  // Draw frame
  console.log(\`Time: \${currentTime.toFixed(2)}s / \${timingMap.metadata.totalDuration.toFixed(2)}s\`);
  console.log('═'.repeat(80));

  // Show active voices
  Object.entries(timingMap.voiceData).forEach(([voiceId, voiceData]) => {
    const activeEvent = voiceData.events.find(e =>
      currentTime >= e.startTime && currentTime < e.endTime
    );

    if (activeEvent) {
      const bar = '█'.repeat(Math.floor((currentTime - activeEvent.startTime) / activeEvent.duration * 40));
      console.log(\`Voice \${voiceId}: [\${bar.padEnd(40, '░')}] \${activeEvent.type}\`);
    } else {
      console.log(\`Voice \${voiceId}: [\${'░'.repeat(40)}] silent\`);
    }
  });

  frameIndex++;

  // Continue animation
  if (currentTime < timingMap.metadata.totalDuration) {
    setTimeout(animate, frameInterval);
  } else {
    // Cleanup
    process.stdout.write('\\x1B[?25h'); // Show cursor
    player.kill();
    rl.close();
    console.log('\\nAnimation complete!');
  }
};

// Start animation
console.log('🎵 Starting ASCII Music Animation...');
console.log('Press Ctrl+C to stop');
setTimeout(animate, 1000); // Give time for MIDI to start

// Handle exit
process.on('SIGINT', () => {
  process.stdout.write('\\x1B[?25h'); // Show cursor
  player.kill();
  rl.close();
  process.exit();
});
`;

  const scriptFile = timingMapFile.replace('.json', '.animation.js');
  await fs.writeFile(scriptFile, scriptContent, 'utf-8');
  await fs.chmod(scriptFile, 0o755);
  console.log(chalk.green(`✓ Animation script created: ${scriptFile}`));
  console.log(chalk.gray(`  Run with: node ${scriptFile}`));
}
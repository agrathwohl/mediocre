import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { config } from '../utils/config.js';
import { useFluidSynthPlayback } from '../utils/feature-flags.js';
import { FluidSynthPlayback } from '../utils/fluidsynth-playback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert MIDI files to WAV
 * @param {Object} options - Command options
 * @param {string} [options.input] - Input MIDI file
 * @param {string} [options.directory] - Input directory with MIDI files
 * @param {string} [options.output] - Output directory
 * @returns {Promise<string[]>} Array of generated WAV file paths
 */
export async function convertToWav(options) {
  const outputDir = options.output || config.get('outputDir');
  const generatedFiles = [];
  
  // Ensure the output directory exists
  await fs.promises.mkdir(outputDir, { recursive: true });
  // Process a single file if provided
  if (options.input) {
    try {
      await fs.promises.access(options.input);
      const outputPath = path.join(outputDir, path.basename(options.input, '.mid') + '.wav');
      await convertFile(options.input, outputPath);
      generatedFiles.push(outputPath);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  // Process all files in a directory if provided
  if (options.directory) {
    try {
      await fs.promises.access(options.directory);
      const files = await fs.promises.readdir(options.directory);
    for (const file of files) {
        if (file.endsWith('.mid')) {
          const inputPath = path.join(options.directory, file);
        const outputPath = path.join(outputDir, path.basename(file, '.mid') + '.wav');
          try {
            await convertFile(inputPath, outputPath);
            generatedFiles.push(outputPath);
          } catch (error) {
            console.error(`Error converting ${inputPath}: ${error.message}`);
          }
        }
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  
  return generatedFiles;
}

/**
 * Convert a single MIDI file to WAV
 * @param {string} inputPath - Input MIDI file path
 * @param {string} outputPath - Output WAV file path
 * @param {Object} [soundfontSelection] - Optional soundfont selection (for FluidSynth)
 * @returns {Promise<void>}
 */
async function convertFile(inputPath, outputPath, soundfontSelection = null) {
  try {
    console.log(`Converting ${inputPath} to ${outputPath}`);

    // Check if FluidSynth playback is enabled
    if (useFluidSynthPlayback()) {
      await convertFileWithFluidSynth(inputPath, outputPath, soundfontSelection);
    } else {
      await convertFileWithTiMidity(inputPath, outputPath);
    }

    console.log(`✅ Converted ${path.basename(inputPath)} to ${path.basename(outputPath)}`);
  } catch (error) {
    throw new Error(`Failed to convert ${inputPath} to WAV: ${error.message}`);
  }
}

/**
 * Convert MIDI to WAV using TiMidity (traditional method)
 */
async function convertFileWithTiMidity(inputPath, outputPath) {
  console.log('   Using TiMidity for conversion...');

  // Check if timidity is installed
  try {
    await execa('which', ['timidity']);
  } catch (error) {
    throw new Error('timidity not found. Please install timidity package.');
  }

  // Auto-detect custom TiMidity config (written by timidity-config agent)
  // Config lives next to the MIDI file with same base name
  const configPath = inputPath.replace(/\.mid$/, '.timidity.cfg');
  let hasCustomConfig = false;
  try {
    await fs.promises.access(configPath);
    hasCustomConfig = true;
    console.log(`   Using custom soundfont config: ${path.basename(configPath)}`);
  } catch {
    // No custom config found, use defaults
  }

  // Convert MIDI to WAV using timidity
  await execa('timidity', [
    ...(hasCustomConfig ? ['-c', configPath] : []),
    inputPath,
    '-Ow',
    '-o', outputPath,
    '-s', '44100',  // Sample rate
  ]);
}

/**
 * Convert MIDI to WAV using FluidSynth (new method)
 */
async function convertFileWithFluidSynth(inputPath, outputPath, soundfontSelection) {
  console.log('   Using FluidSynth for conversion...');

  // Use default soundfonts if none provided
  if (!soundfontSelection) {
    soundfontSelection = {
      soundfonts: [
        'GeneralUser GS v1.471.sf2',
        'FluidR3 GM + GS.sf2',
        'SGM-128 v1.17.sf2',
      ],
      categories: {
        general: ['GeneralUser GS v1.471.sf2', 'FluidR3 GM + GS.sf2', 'SGM-128 v1.17.sf2'],
        drums: [],
        bass: [],
        strings: [],
        synth: [],
        specialty: [],
      },
    };
    console.log('   Using default soundfont stack (GeneralUser GS, FluidR3, SGM-128)');
  } else {
    console.log(`   Using ${soundfontSelection.soundfonts?.length || 0} soundfonts from selection`);
  }

  // Initialize FluidSynth
  const fluidsynth = new FluidSynthPlayback({
    sampleRate: 44100,
    gain: 0.5,
  });

  await fluidsynth.initialize(soundfontSelection);

  // Render MIDI to WAV using CLI
  await fluidsynth.playMIDI(inputPath, outputPath);

  // Clean up
  fluidsynth.close();
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    input: args[0],
    directory: args[1],
    output: args[2] || config.get('outputDir')
  };
  
  (async () => {
    try {
      const files = await convertToWav(options);
      console.log(`Converted ${files.length} file(s) to WAV`);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  })();
}
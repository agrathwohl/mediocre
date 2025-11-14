import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { config } from '../utils/config.js';
import {
  selectSoundfontForGenre,
  getSoundfontPath,
  getTimidityArgs,
  soundfontExists,
  SOUNDFONT_PROFILES
} from '../utils/soundfont-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert MIDI files to WAV
 * @param {Object} options - Command options
 * @param {string} [options.input] - Input MIDI file
 * @param {string} [options.directory] - Input directory with MIDI files
 * @param {string} [options.output] - Output directory
 * @param {boolean} [options.stems] - Whether to export individual stems for each instrument
 * @param {string} [options.soundfont] - Soundfont profile name
 * @param {string} [options.genre] - Musical genre for auto soundfont selection
 * @param {number} [options.sampleRate] - Sample rate for audio output
 * @returns {Promise<string[]>} Array of generated WAV file paths
 */
export async function convertToWav(options) {
  const outputDir = options.output || config.get('outputDir');
  const generatedFiles = [];
  const exportStems = options.stems === true;

  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Prepare conversion options
  const conversionOptions = {
    soundfont: options.soundfont,
    genre: options.genre,
    sampleRate: options.sampleRate
  };

  // Process a single file if provided
  if (options.input && fs.existsSync(options.input)) {
    const outputPath = path.join(outputDir, path.basename(options.input, '.mid') + '.wav');

    if (exportStems) {
      const stemFiles = await convertFileWithStems(options.input, outputPath, conversionOptions);
      generatedFiles.push(...stemFiles);
    } else {
      await convertFile(options.input, outputPath, conversionOptions);
      generatedFiles.push(outputPath);
    }
  }

  // Process all files in a directory if provided
  if (options.directory && fs.existsSync(options.directory)) {
    const files = fs.readdirSync(options.directory);

    for (const file of files) {
      if (file.endsWith('.mid')) {
        const inputPath = path.join(options.directory, file);
        const outputPath = path.join(outputDir, path.basename(file, '.mid') + '.wav');

        try {
          if (exportStems) {
            const stemFiles = await convertFileWithStems(inputPath, outputPath, conversionOptions);
            generatedFiles.push(...stemFiles);
          } else {
            await convertFile(inputPath, outputPath, conversionOptions);
            generatedFiles.push(outputPath);
          }
        } catch (error) {
          console.error(`Error converting ${inputPath}: ${error.message}`);
        }
      }
    }
  }

  return generatedFiles;
}

/**
 * Convert a single MIDI file to WAV
 * @param {string} inputPath - Input MIDI file path
 * @param {string} outputPath - Output WAV file path
 * @param {Object} [options={}] - Conversion options
 * @param {string} [options.soundfont='standard'] - Soundfont profile name
 * @param {string} [options.genre] - Musical genre for auto-selection
 * @param {number} [options.sampleRate] - Override sample rate
 * @returns {Promise<void>}
 */
async function convertFile(inputPath, outputPath, options = {}) {
  try {
    console.log(`Converting ${inputPath} to ${outputPath}`);

    // Check if timidity is installed
    try {
      await execa('which', ['timidity']);
    } catch (error) {
      throw new Error('timidity not found. Please install timidity package.');
    }

    // Select soundfont based on genre or profile
    let soundfontProfile = options.soundfont || 'standard';
    if (options.genre && !options.soundfont) {
      // selectSoundfontForGenre now returns a profile name string
      soundfontProfile = selectSoundfontForGenre(options.genre);
      console.log(`Selected ${soundfontProfile} soundfont for genre: ${options.genre}`);
    }

    // Verify soundfont exists
    if (!soundfontExists(soundfontProfile)) {
      console.warn(`Soundfont ${soundfontProfile} not found, falling back to standard`);
      soundfontProfile = 'standard';
      if (!soundfontExists(soundfontProfile)) {
        console.warn('No soundfont files found, using timidity defaults');
        // Fall back to timidity without custom soundfont
        await execa('timidity', [
          inputPath,
          '-Ow',
          '-o', outputPath,
          '-s', options.sampleRate || '44100',  // Sample rate
        ]);
        console.log(`Converted ${inputPath} to ${outputPath} using default timidity sounds`);
        return;
      }
    }

    // Get timidity arguments with soundfont
    const timidityArgs = getTimidityArgs(soundfontProfile, options);

    // Build timidity command arguments
    // CRITICAL: Argument order matters for timidity!
    // - Config files (-c) MUST come before input file
    // - Soundfonts (--config-string) can come before or after input
    // - Output arguments (-Ow, -o) MUST come last
    const config = SOUNDFONT_PROFILES[soundfontProfile];
    let finalArgs;

    if (config?.timidityArgs?.useConfigFile) {
      // Config file mode: [-c config.cfg] [options] [input.mid] [-Ow -o output.wav]
      // timidityArgs already contains -c config.cfg from getTimidityArgs
      finalArgs = [...timidityArgs, inputPath, '-Ow', '-o', outputPath];
    } else {
      // Soundfont mode: [input.mid] [--config-string "soundfont ..."] [options] [-Ow -o output.wav]
      // Place input first, then soundfont config, then output args
      finalArgs = [inputPath, ...timidityArgs, '-Ow', '-o', outputPath];
    }

    // Validate that critical arguments are present
    if (!finalArgs.includes(inputPath)) {
      throw new Error('Internal error: input path missing from timidity args');
    }
    if (!finalArgs.includes(outputPath)) {
      throw new Error('Internal error: output path missing from timidity args');
    }

    // Convert MIDI to WAV
    await execa('timidity', finalArgs);

    console.log(`Converted ${inputPath} to ${outputPath} using ${soundfontProfile} soundfont`);
  } catch (error) {
    throw new Error(`Failed to convert ${inputPath} to WAV: ${error.message}`);
  }
}

/**
 * Extract MIDI track info to identify instruments
 * @param {string} inputPath - Input MIDI file path
 * @returns {Promise<Array<Object>>} Array of track info objects
 */
async function getMidiTrackInfo(inputPath) {
  try {
    // Run timidity with verbose output to get track info
    const { stdout } = await execa('timidity', [
      inputPath,
      '-v', '4',  // Verbose output
      '--print-track-output',  
      '--output-mode=s',      // Silence - don't actually play
      '--quiet=1',            // Silent console
    ]);
    
    // Parse the output to get track info
    const tracks = [];
    const trackPattern = /^Track (\d+): (.+?)(?:, ([-\d]+))?$/gm;
    let match;
    
    while ((match = trackPattern.exec(stdout)) !== null) {
      const trackNum = parseInt(match[1], 10);
      const name = match[2].trim();
      const channel = match[3] ? parseInt(match[3], 10) : null;
      
      tracks.push({
        track: trackNum,
        name: name,
        channel: channel
      });
    }
    
    // If no tracks found, try alternative method looking at MIDI program changes
    if (tracks.length === 0) {
      // Just use track numbers as fallback
      return Array.from({ length: 16 }, (_, i) => ({
        track: i,
        name: `Track ${i + 1}`,
        channel: i
      }));
    }
    
    return tracks;
  } catch (error) {
    console.warn(`Warning: Unable to extract MIDI track info: ${error.message}`);
    // Fallback to simple track numbers
    return Array.from({ length: 16 }, (_, i) => ({
      track: i,
      name: `Track ${i + 1}`,
      channel: i
    }));
  }
}

/**
 * Convert a MIDI file to multiple WAV stems
 * @param {string} inputPath - Input MIDI file path
 * @param {string} outputPath - Base output WAV file path
 * @param {Object} [options={}] - Conversion options
 * @returns {Promise<string[]>} Array of generated stem file paths
 */
async function convertFileWithStems(inputPath, outputPath, options = {}) {
  try {
    console.log(`Converting ${inputPath} to WAV stems...`);

    // Check if timidity is installed
    try {
      await execa('which', ['timidity']);
    } catch (error) {
      throw new Error('timidity not found. Please install timidity package.');
    }

    // First create the full mix for reference
    await convertFile(inputPath, outputPath, options);
    const generatedStems = [outputPath];

    // Check if MIDI stem files exist (created by convert-midi with --stems)
    const inputDir = path.dirname(inputPath);
    const baseFileName = path.basename(inputPath, '.mid');
    const midiStemDir = path.join(inputDir, 'stems', baseFileName);

    // Create WAV stems directory
    const wavStemDir = path.join(path.dirname(outputPath), 'stems');
    if (!fs.existsSync(wavStemDir)) {
      fs.mkdirSync(wavStemDir, { recursive: true });
    }

    // Create subdirectory for this specific file's WAV stems
    const wavFileSpecificStemDir = path.join(wavStemDir, path.basename(outputPath, '.wav'));
    if (!fs.existsSync(wavFileSpecificStemDir)) {
      fs.mkdirSync(wavFileSpecificStemDir, { recursive: true });
    }

    // Check if MIDI stems exist
    if (fs.existsSync(midiStemDir)) {
      console.log(`Found MIDI stems in ${midiStemDir}, converting each to WAV...`);

      // Read all MIDI stem files
      const midiStemFiles = fs.readdirSync(midiStemDir).filter(f => f.endsWith('.mid'));

      for (const midiStemFile of midiStemFiles) {
        const midiStemPath = path.join(midiStemDir, midiStemFile);
        const wavStemFileName = midiStemFile.replace('.mid', '.wav');
        const wavStemPath = path.join(wavFileSpecificStemDir, wavStemFileName);

        console.log(`Converting stem: ${midiStemFile} -> ${wavStemFileName}`);

        // Convert individual MIDI stem to WAV using the same soundfont settings
        await convertFile(midiStemPath, wavStemPath, options);
        generatedStems.push(wavStemPath);
      }

      console.log(`Successfully converted ${midiStemFiles.length} MIDI stems to WAV`);
    } else {
      // Fallback: Try to extract stems using channel muting (less reliable for ABC-generated files)
      console.log(`No MIDI stems found, attempting channel-based stem extraction...`);
      console.log(`Note: For better results, first convert ABC to MIDI with --stems flag`);

      // Get track info from the MIDI file
      const tracks = await getMidiTrackInfo(inputPath);
      console.log(`Found ${tracks.length} tracks in ${inputPath}`);

      // Generate stems for each track using channel muting
      for (const track of tracks) {
        // Skip tracks with no channel assignment
        if (track.channel === null) continue;

        // Sanitize track name for file system
        const sanitizedName = track.name
          .replace(/[^\w\s-]/g, '')  // Remove non-alphanumeric characters
          .replace(/\s+/g, '_')      // Replace spaces with underscores
          .toLowerCase();

        // Create stem file path
        const stemFileName = `${path.basename(outputPath, '.wav')}_${sanitizedName}_track${track.track}.wav`;
        const stemFilePath = path.join(wavFileSpecificStemDir, stemFileName);

        console.log(`Generating stem for track ${track.track} (${track.name}) on channel ${track.channel}...`);

        // Build timidity arguments for channel isolation
        const channelArgs = [];

        // Method 1: Use track muting (preferred)
        if (tracks.length <= 32) {
          // Mute all tracks except the one we want
          for (let i = 0; i < tracks.length; i++) {
            if (i !== track.track) {
              channelArgs.push('--mute', i.toString());
            }
          }
        } else {
          // Method 2: Use channel volume control as fallback
          for (let i = 0; i < 16; i++) {
            if (i !== track.channel) {
              channelArgs.push('-OD', `${i}=0`);  // Set channel volume to 0
            }
          }
        }

        // Select soundfont based on options
        let soundfontProfile = options.soundfont || 'standard';
        if (options.genre && !options.soundfont) {
          soundfontProfile = selectSoundfontForGenre(options.genre);
        }

        // Get base timidity arguments (without input/output paths)
        const baseArgs = soundfontExists(soundfontProfile) ?
          getTimidityArgs(soundfontProfile, options) : [];

        // Build final arguments
        const finalArgs = [
          inputPath,
          ...baseArgs,
          ...channelArgs,
          '-Ow',
          '-o', stemFilePath
        ];

        // Convert to WAV with channel isolation
        try {
          await execa('timidity', finalArgs);
          generatedStems.push(stemFilePath);
          console.log(`Generated stem file: ${stemFilePath}`);
        } catch (error) {
          console.error(`Warning: Failed to generate stem for track ${track.track}: ${error.message}`);
        }
      }
    }

    return generatedStems;
  } catch (error) {
    throw new Error(`Failed to convert ${inputPath} to WAV stems: ${error.message}`);
  }
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    input: args[0],
    directory: args[1],
    output: args[2] || config.get('outputDir'),
    stems: args.includes('--stems')
  };
  
  convertToWav(options)
    .then(files => {
      console.log(`Converted ${files.length} file(s) to WAV`);
      if (options.stems) {
        console.log('Stems have been created in the stems/ directory');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
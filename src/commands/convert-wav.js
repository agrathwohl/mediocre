import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { config } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert MIDI files to WAV
 * @param {Object} options - Command options
 * @param {string} [options.input] - Input MIDI file
 * @param {string} [options.directory] - Input directory with MIDI files
 * @param {string} [options.output] - Output directory
 * @param {boolean} [options.stems] - Whether to export individual stems for each instrument
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
  
  // Process a single file if provided
  if (options.input && fs.existsSync(options.input)) {
    const outputPath = path.join(outputDir, path.basename(options.input, '.mid') + '.wav');
    
    if (exportStems) {
      const stemFiles = await convertFileWithStems(options.input, outputPath);
      generatedFiles.push(...stemFiles);
    } else {
      await convertFile(options.input, outputPath);
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
            const stemFiles = await convertFileWithStems(inputPath, outputPath);
            generatedFiles.push(...stemFiles);
          } else {
            await convertFile(inputPath, outputPath);
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
 * @returns {Promise<void>}
 */
async function convertFile(inputPath, outputPath) {
  try {
    console.log(`Converting ${inputPath} to ${outputPath}`);
    
    // Check if timidity is installed
    try {
      await execa('which', ['timidity']);
    } catch (error) {
      throw new Error('timidity not found. Please install timidity package.');
    }
    
    // Convert MIDI to WAV using timidity
    await execa('timidity', [
      inputPath,
      '-Ow',
      '-o', outputPath,
      '-s', '44100',  // Sample rate
    ]);
    
    console.log(`Converted ${inputPath} to ${outputPath}`);
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
 * @returns {Promise<string[]>} Array of generated stem file paths
 */
async function convertFileWithStems(inputPath, outputPath) {
  try {
    console.log(`Converting ${inputPath} to stems...`);
    
    // Check if timidity is installed
    try {
      await execa('which', ['timidity']);
    } catch (error) {
      throw new Error('timidity not found. Please install timidity package.');
    }
    
    // First, get the track info
    const tracks = await getMidiTrackInfo(inputPath);
    console.log(`Found ${tracks.length} tracks in ${inputPath}`);
    
    // Also create the full mix for reference
    await convertFile(inputPath, outputPath);
    
    // Create a stems directory
    const stemDir = path.join(path.dirname(outputPath), 'stems');
    if (!fs.existsSync(stemDir)) {
      fs.mkdirSync(stemDir, { recursive: true });
    }
    
    // Create a subdirectory for this specific MIDI file's stems
    const baseFileName = path.basename(outputPath, '.wav');
    const fileSpecificStemDir = path.join(stemDir, baseFileName);
    if (!fs.existsSync(fileSpecificStemDir)) {
      fs.mkdirSync(fileSpecificStemDir, { recursive: true });
    }
    
    // Generate stems for each track
    const generatedStems = [];
    
    for (const track of tracks) {
      // Skip tracks with no channel assignment or drum channel (9)
      if (track.channel === null) continue;
      
      // Sanitize track name for file system
      const sanitizedName = track.name
        .replace(/[^\w\s-]/g, '')  // Remove non-alphanumeric characters except space and dash
        .replace(/\s+/g, '_')      // Replace spaces with underscores
        .toLowerCase();
      
      // Create stem file path
      const stemFileName = `${baseFileName}_${sanitizedName}_track${track.track}.wav`;
      const stemFilePath = path.join(fileSpecificStemDir, stemFileName);
      
      console.log(`Generating stem for track ${track.track} (${track.name})...`);
      
      // Use timidity's channel mapping to isolate this track
      // Create a mute map of all 16 channels except the one we want
      const channelArgs = [];
      for (let i = 0; i < 16; i++) {
        if (i !== track.channel) {
          channelArgs.push('-Oc', i.toString(), '0');  // Mute this channel
        }
      }
      
      // Convert MIDI to WAV using timidity with channel muting
      await execa('timidity', [
        inputPath,
        '-Ow',
        '-o', stemFilePath,
        '-s', '44100',  // Sample rate
        ...channelArgs,
      ]);
      
      generatedStems.push(stemFilePath);
      console.log(`Generated stem file: ${stemFilePath}`);
    }
    
    return [outputPath, ...generatedStems];
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